// ============================================================
//  МОДУЛЬ CRYPTO SIGNAL TOOL (v10.4)
//  + Nadaraya-Watson Envelope (endpoint / non-repainting)
//  + 8 индикаторов: RSI, MACD, EMA, CVD, BB, Volume, POC, NW Env
//  + indicatorStates для всех индикаторов
//  + нормализация % по весу, нейтральные значения
//  + фиксы _macd, _poc, _normalizeCandles, _handleKline volume
//  + единая агрегация, оптимизация бэктеста
// ============================================================

// ---------- Конфигурация ----------
const CONFIG = {
  assets: ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "GRAM", "TRX", "PAXG"],
  symbolMap: {
    BTC: "BTCUSDT",
    ETH: "ETHUSDT",
    BNB: "BNBUSDT",
    SOL: "SOLUSDT",
    XRP: "XRPUSDT",
    ADA: "ADAUSDT",
    GRAM: "GRAMUSDT",
    TRX: "TRXUSDT",
    PAXG: "PAXGUSDT",
  },
  timeframes: ["15m", "1h", "2h", "4h", "1d"],
  tfMinutes: { "15m": 15, "1h": 60, "2h": 120, "4h": 240, "1d": 1440 },
  defaultTF: "1h",
  wsEndpoint: "wss://stream.binance.com:9443/ws",
  maxCandles: 1500,
  historyCandles: 1500,
  minCandlesRequired: 50,
  trading: {
    minConfidence: 75,
    rsiOverbought: 70,
    rsiOversold: 30,
    requireHtfConfirm: true,
    stopAtrMult: 1.25,
    takeProfitAtrMult: 2.5,
    minProfitPercent: 2.0,
    maxLossPercent: 1.0,
    positionSize: 1000,
  },
  sound: { threshold: 75, filePath: "audio/Ding-ding.mp3" },
  indicators: {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    emaPeriods: [8, 13, 21, 50],
    bbPeriod: 20,
    bbStdDev: 2,
    atrPeriod: 14,
    // Параметры NW Envelope (LuxAlgo defaults, endpoint mode)
    nw: { h: 8, mult: 3, window: 500, maeWindow: 499, minCandles: 1000 },
  },
  fearGreed: { intervalMs: 5 * 60 * 1000, neutralFallback: 50 },
  scoring: {
    weights: {
      rsi: 20,
      macd: 20,
      ema: 20,
      cvd: 10,
      bb: 10,
      volume: 20,
      poc: 20,
      nw: 15,
    },
    gradations: {
      rsi: { extreme: 1.0, strong: 0.66, normal: 0.5, weak: 0.16 },
      macd: { main: 1.0, trend: 0.5 },
      bb: { touch: 1.0, squeeze: 0.66 },
    },
    strongThreshold: 30,
  },
};

const MACRO_SCALE = [
  {
    min: 75,
    max: 100,
    label: "Очень здоровый",
    color: "#22c55e",
    barClass: "ms-green",
  },
  {
    min: 55,
    max: 74,
    label: "Здоровый",
    color: "#eab308",
    barClass: "ms-yellow",
  },
  {
    min: 40,
    max: 54,
    label: "Осторожно",
    color: "#f97316",
    barClass: "ms-orange",
  },
  { min: 20, max: 39, label: "Риск", color: "#ef4444", barClass: "ms-red" },
  { min: 0, max: 19, label: "Экстрим", color: "#ef4444", barClass: "ms-red" },
];

// ============================================================
//  ГАЙДЫ ПО ТАЙМФРЕЙМАМ
// ============================================================
const TF_GUIDES = {
  "15m": {
    name: "15 Минут",
    icon: "⚡",
    tagline: "Скальпинг • Высокий риск",
    description:
      "<b>Что смотреть в первую очередь:</b> Volume Spike + CVD + RSI<br>• MACD на 15m даёт много ложных сигналов — вес снижается автоматически<br>• EMA Ribbon работает только если все 4 EMA выстроены в идеальный порядок<br>• 15m — самый шумный TF. Без подтверждения старшего TF — не входить.",
    entryDescription:
      "<b>Когда входить:</b><br>• RSI &lt; 30 (перепродан) и CVD растёт (покупатели возвращаются)<br>• Volume Spike &gt; 1.5× от среднего и цена выше EMA8<br>• Цена касается нижней полосы Боллинджера и отскакивает<br>• POC рядом (в пределах 0.2 ATR) — уровень поддержки<br>• Confidence ≥ 75% и HTF (1h) подтверждает",
    waitDescription:
      "<b>Когда ждать:</b><br>• Bollinger Width &lt; 0.05 — сжатие, рынок в боковике → не входить, ждать пробоя<br>• RSI между 40–60 и MACD флэт → нет импульса<br>• CVD и цена расходятся → ложный сигнал<br>• BB Width &gt; 0.1 — волатильность высока, рынок в шуме<br>• EMA Ribbon не в порядке → тренд не определён<br>• Нет Volume Spike → нет топлива для движения",
    action: {
      BUY: "Скальпинг. Цель: +0.5-1.5%. Стоп: -0.5-1%.",
      SELL: "Краткосрочный выход. Цель: +0.5-1.5%. Стоп: -0.5-1%.",
      WAIT: "Рынок неопределён. Ждите 1H+.",
    },
    risk: "Высокий",
    leverage: "1–2× (макс. 3× опытным)",
    positionSize: "1-2%",
    stopLoss: "0.5-1%",
    takeProfit: "0.5-1.5%",
    holdTime: "15–60 минут",
    proTip: "Профи не торгуют 15m без HTF-подтверждения — слишком много шума.",
  },
  "1h": {
    name: "1 Час",
    icon: "🕐",
    tagline: "Стандартный внутридневной",
    description:
      "<b>Что смотреть в первую очередь:</b> MACD + EMA Ribbon + RSI<br>• «Золотая середина»: достаточно данных для тренда, но не слишком медленно<br>• CVD начинает давать значимые сигналы (не шум)<br>• Лучшее соотношение сигнал/шум среди всех TF.",
    entryDescription:
      "<b>Когда входить:</b><br>• EMA8 &gt; EMA13 &gt; EMA21 &gt; EMA50 (полный бычий порядок)<br>• MACD histogram &gt; 0 и растёт (импульс набирает силу)<br>• RSI 40–65 (не перекуплен, есть запас роста)<br>• CVD растёт и положительный<br>• Volume Spike подтверждает вход<br>• HTF (4h) подтверждает направление",
    waitDescription:
      "<b>Когда ждать:</b><br>• EMA выстроены в «спутанный клубок» — нет тренда<br>• MACD histogram колеблется вокруг нуля<br>• Confidence &lt; 65% — сигнал слабый, ждать 2H+<br>• HTF (4h) не подтверждает направление<br>• RSI 40–60 и нет чёткого импульса",
    action: {
      BUY: "Стандартный вход. Цель: +1-3%. Стоп: -1-1.5%.",
      SELL: "Стандартный выход. Цель: +1-3%. Стоп: -1-1.5%.",
      WAIT: "Сигнал слабый. Ждите 2H+.",
    },
    risk: "Средний",
    leverage: "2–3× (профи)",
    positionSize: "3-5%",
    stopLoss: "1-1.5%",
    takeProfit: "1-3%",
    holdTime: "1–8 часов",
    proTip:
      "1h — оптимальный TF для большинства. Здесь лучшее соотношение сигнал/шум.",
  },
  "2h": {
    name: "2 Часа",
    icon: "🕑",
    tagline: "Свинг-трейдинг",
    description:
      "<b>Что смотреть в первую очередь:</b> EMA Ribbon + POC + MACD<br>• Тренд более устойчив, меньше ложных пробоев<br>• POC начинает работать как реальный уровень поддержки/сопротивления<br>• Хорошо подходит для удержания позиции через ночь.",
    entryDescription:
      "<b>Когда входить:</b><br>• Цена выше EMA50 и EMA Ribbon выстроена<br>• MACD line &gt; signal line, histogram растёт<br>• RSI 45–70<br>• POC ниже цены (поддержка под нами)<br>• CVD стабильно положительный",
    waitDescription:
      "<b>Когда ждать:</b><br>• Цена зажата между EMA21 и EMA50<br>• Bollinger Width сжимается (&lt; 0.08) — перед большим движением, но направление неясно<br>• RSI дивергенция (цена растёт, RSI падает) — разворот<br>• Confidence &lt; 70%<br>• POC прямо над ценой — сопротивление",
    action: {
      BUY: "Свинг-трейдинг. Цель: +2-4%. Стоп: -1.5-2%.",
      SELL: "Свинг-выход. Цель: +2-4%. Стоп: -1.5-2%.",
      WAIT: "Тренд не сформирован. Ждите 4H+.",
    },
    risk: "Средний-Высокий",
    leverage: "3–5×",
    positionSize: "3-5%",
    stopLoss: "1.5-2%",
    takeProfit: "2-4%",
    holdTime: "4–24 часа",
    proTip: "2h — компромисс между скоростью 1h и надёжностью 4h.",
  },
  "4h": {
    name: "4 Часа",
    icon: "🕓",
    tagline: "Среднесрочный • Рекомендуемый профи",
    description:
      "<b>Что смотреть в первую очередь:</b> EMA Ribbon + MACD + POC + CVD<br>• <b>Основной TF для профессиональной торговли</b><br>• Все 8 индикаторов работают максимально надёжно<br>• HTF подтверждение от 1d обязательно<br>• Оптимальное R:R (риск/прибыль) — «рабочая лошадка» профи.",
    entryDescription:
      "<b>Когда входить («идеальный шторм»):</b><br>1. EMA Ribbon: EMA8 &gt; EMA13 &gt; EMA21 &gt; EMA50<br>2. MACD: histogram &gt; 0 и растёт 2+ свечи<br>3. RSI: 45–68 (здоровый бычий диапазон)<br>4. CVD: растёт и положительный<br>5. Volume Spike: &gt; 1.3× подтверждает движение<br>6. POC: ниже цены, работает как поддержка<br>7. Bollinger: цена не у верхней границы<br>8. NW Env: отскок от нижней полосы (контр-тренд)<br>9. HTF (1d): цена выше EMA50 на дневке<br>10. Confidence ≥ 75%",
    waitDescription:
      "<b>Когда ждать:</b><br>• RSI &gt; 70 (перекуплен) — не входить в лонг<br>• Bollinger squeeze (&lt; 0.07) — ждать пробоя<br>• Цена у POC сверху — сопротивление<br>• 1d не подтверждает<br>• Confidence 60–70% — ждать усиления<br>• Новости / FOMC / CPI — ждать 30 мин после релиза",
    action: {
      BUY: "Среднесрочный вход. Цель: +3-6%. Стоп: -2-3%.",
      SELL: "Среднесрочный выход. Цель: +3-6%. Стоп: -2-3%.",
      WAIT: "Нет чёткого тренда. Ждите 1D+.",
    },
    risk: "Средний",
    leverage: "3–10× (профи: 3–5×)",
    positionSize: "5-10%",
    stopLoss: "2-3%",
    takeProfit: "3-6%",
    holdTime: "1–7 дней",
    proTip:
      "4h — «рабочая лошадка» профи. Меньше шума, чем 1h, больше возможностей, чем 1d.",
  },
  "1d": {
    name: "День",
    icon: "🗓",
    tagline: "Долгосрочный • Низкий риск",
    description:
      "<b>Что смотреть в первую очередь:</b> EMA Ribbon + POC + Bollinger<br>• RSI и MACD здесь — вспомогательные<br>• CVD на дневке — сильный сигнал смены тренда<br>• NW Env — редкие, но точные разворотные сигналы<br>• Подходит для позиционной торговли и инвестиций.",
    entryDescription:
      "<b>Когда входить:</b><br>• EMA8 &gt; EMA13 &gt; EMA21 &gt; EMA50 (устойчивый бычий тренд)<br>• Цена выше EMA50 более 5 свечей<br>• RSI 50–70 (стабильный бычий диапазон)<br>• POC значительно ниже цены<br>• NW Env: отскок от нижней полосы",
    waitDescription:
      "<b>Когда ждать:</b><br>• RSI &lt; 40 на дневке — медвежий рынок<br>• EMA Ribbon «спутан» — глобальная неопределённость<br>• Цена ниже EMA50 — не покупать<br>• Bollinger Width &gt; 0.3 — экстремальная волатильность<br>• F&amp;G &lt; 20 или &gt; 80 — экстрим, возможен разворот",
    action: {
      BUY: "Долгосрочный вход. Цель: +5-15%. Стоп: -3-5%.",
      SELL: "Долгосрочный выход. Цель: +5-15%. Стоп: -3-5%.",
      WAIT: "Глобальный тренд не определён.",
    },
    risk: "Низкий-Средний",
    leverage: "1–3× (профи: 1–2×)",
    positionSize: "10-20%",
    stopLoss: "3-5%",
    takeProfit: "5-15%",
    holdTime: "1–8 недель",
    proTip: "На 1d профи зарабатывают на R:R 3:1+ и терпении, а не на плече.",
  },
};

// ---------- Утилиты ----------
const utils = {
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  toMs: (t) => {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return n < 1e12 ? n * 1000 : n;
  },
  aggregateCandles: (candles, tf) => {
    const minutes = CONFIG.tfMinutes[tf] || 60;
    if (!candles || !candles.length) return [];
    const agg = [];
    let current = null;
    for (const c of candles) {
      if (!current) {
        current = { ...c };
        continue;
      }
      const diff = (c.time - current.time) / (60 * 1000);
      if (diff >= minutes) {
        agg.push(current);
        current = { ...c };
      } else {
        current.high = Math.max(current.high, c.high);
        current.low = Math.min(current.low, c.low);
        current.close = c.close;
        current.volume += c.volume;
      }
    }
    if (current) agg.push(current);
    return agg;
  },
};

// ---------- SoundManager ----------
class SoundManager {
  constructor() {
    this._enabled = true;
    this._loaded = false;
    this._audio = new Audio();
    this._audio.preload = "auto";
    this._audio.src = CONFIG.sound.filePath;
    this._lastPlayed = new Map();
    this._intervals = new Map();
    this._useFallback = false;
    this._audioCtx = null;
    this._init();
  }
  _init() {
    this._audio.addEventListener("canplaythrough", () => {
      this._loaded = true;
    });
    this._audio.addEventListener("error", () => {
      this._useFallback = true;
      this._loaded = true;
      this._initWebAudio();
    });
    if (this._audio.readyState >= 3) this._loaded = true;
    this._loadState();
    const resume = () => {
      if (this._audioCtx && this._audioCtx.state === "suspended")
        this._audioCtx.resume().catch(() => {});
      document.removeEventListener("click", resume);
      document.removeEventListener("touchstart", resume);
    };
    document.addEventListener("click", resume);
    document.addEventListener("touchstart", resume);
  }
  _initWebAudio() {
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this._loaded = false;
    }
  }
  _playFallback() {
    if (!this._audioCtx) return;
    try {
      if (this._audioCtx.state === "suspended")
        this._audioCtx.resume().catch(() => {});
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this._audioCtx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, this._audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this._audioCtx.currentTime + 0.2,
      );
      osc.start(this._audioCtx.currentTime);
      osc.stop(this._audioCtx.currentTime + 0.2);
    } catch (e) {}
  }
  play(signalType, asset, confidence) {
    if (!this._enabled || !this._loaded || confidence < CONFIG.sound.threshold)
      return;
    const key = `${asset}-${signalType}`;
    const now = Date.now();
    if (now - (this._lastPlayed.get(key) || 0) < 10000) return;
    this._lastPlayed.set(key, now);
    try {
      if (this._useFallback) this._playFallback();
      else {
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
      }
      for (const [k, t] of this._lastPlayed)
        if (now - t > 300000) this._lastPlayed.delete(k);
    } catch (e) {}
  }
  startRepeating(asset, signalType, confidence) {
    const key = `${asset}-${signalType}`;
    if (this._intervals.has(key)) return;
    this.play(signalType, asset, confidence);
    this._intervals.set(
      key,
      setInterval(() => this.play(signalType, asset, confidence), 10000),
    );
  }
  stopRepeating(asset) {
    for (const [key, id] of this._intervals) {
      if (key.startsWith(`${asset}-`)) {
        clearInterval(id);
        this._intervals.delete(key);
      }
    }
    for (const [key] of this._lastPlayed)
      if (key.startsWith(`${asset}-`)) this._lastPlayed.delete(key);
  }
  clearAll() {
    for (const [, id] of this._intervals) clearInterval(id);
    this._intervals.clear();
    this._lastPlayed.clear();
  }
  toggle() {
    this._enabled = !this._enabled;
    this._saveState();
    if (!this._enabled) this.clearAll();
    return this._enabled;
  }
  _saveState() {
    try {
      localStorage.setItem("signalSoundEnabled", JSON.stringify(this._enabled));
    } catch (e) {}
  }
  _loadState() {
    try {
      const v = localStorage.getItem("signalSoundEnabled");
      if (v !== null) this._enabled = JSON.parse(v);
    } catch (e) {}
  }
}

// ---------- DataLoader ----------
class DataLoader {
  constructor() {
    this.exchanges = [
      { id: "binance", url: "https://api.binance.com/api/v3/klines" },
      { id: "bybit", url: "https://api.bybit.com/v5/market/kline" },
      { id: "okx", url: "https://www.okx.com/api/v5/market/history-candles" },
      { id: "mexc", url: "https://api.mexc.com/api/v3/klines" },
      { id: "coinbase", url: "https://api.exchange.coinbase.com/products" },
      { id: "htx", url: "https://api.huobi.pro/market/history/kline" },
      { id: "kucoin", url: "https://api.kucoin.com/api/v1/market/candles" },
    ];
    this.timeout = 8000;
    this.maxRetries = 3;
  }
  _formatSymbol(id, s) {
    switch (id) {
      case "binance":
      case "bybit":
      case "mexc":
        return s;
      case "kucoin":
      case "okx":
        return s.replace("USDT", "-USDT").replace("BUSD", "-BUSD");
      case "coinbase":
        return s.replace("USDT", "-USD").replace("BUSD", "-USD");
      case "htx":
        return s.toLowerCase();
      default:
        return s;
    }
  }
  async fetchCandles(symbol, interval = "1h", limit = CONFIG.historyCandles) {
    const im = {
      "15m": {
        binance: "15m",
        bybit: "15",
        okx: "15m",
        mexc: "15m",
        htx: "15min",
        kucoin: "15min",
        coinbase: "15m",
      },
      "1h": {
        binance: "1h",
        bybit: "60",
        okx: "1H",
        mexc: "1h",
        htx: "60min",
        kucoin: "1hour",
        coinbase: "1h",
      },
      "2h": {
        binance: "2h",
        bybit: "120",
        okx: "2H",
        mexc: "2h",
        htx: "2hour",
        kucoin: "2hour",
        coinbase: "2h",
      },
      "4h": {
        binance: "4h",
        bybit: "240",
        okx: "4H",
        mexc: "4h",
        htx: "4hour",
        kucoin: "4hour",
        coinbase: "4h",
      },
      "1d": {
        binance: "1d",
        bybit: "D",
        okx: "1D",
        mexc: "1d",
        htx: "1day",
        kucoin: "1day",
        coinbase: "1d",
      },
    };
    const ordered = [
      this.exchanges.find((e) => e.id === "binance"),
      ...this.exchanges.filter((e) => e.id !== "binance"),
    ].filter(Boolean);
    for (const ex of ordered) {
      for (let a = 0; a < this.maxRetries; a++) {
        try {
          const fs = this._formatSymbol(ex.id, symbol);
          const istr = im[interval]?.[ex.id] || "1h";
          const url = this._buildUrl(ex, fs, istr, limit);
          if (!url) continue;
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), this.timeout);
          const r = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: ctrl.signal,
          });
          clearTimeout(tid);
          if (!r.ok) {
            if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
            continue;
          }
          const data = await r.json();
          const candles = this._parse(data, ex.id);
          if (candles && candles.length >= CONFIG.minCandlesRequired)
            return candles;
        } catch (e) {
          if (a < this.maxRetries - 1) await utils.sleep(1000 * (a + 1));
        }
      }
    }
    return [];
  }
  _buildUrl(ex, s, istr, limit) {
    const lim = this._clampLimit(ex.id, limit);
    switch (ex.id) {
      case "binance":
        return `${ex.url}?symbol=${s}&interval=${istr}&limit=${lim}`;
      case "bybit":
        return `${ex.url}?symbol=${s}&interval=${istr}&limit=${lim}`;
      case "okx":
        return `${ex.url}?instId=${s}&bar=${istr}&limit=${lim}`;
      case "mexc":
        return `${ex.url}?symbol=${s}&interval=${istr}&limit=${lim}`;
      case "coinbase": {
        const g =
          istr === "1h"
            ? 3600
            : istr === "15m"
              ? 900
              : istr === "2h"
                ? 7200
                : istr === "4h"
                  ? 14400
                  : 86400;
        return `${ex.url}/${s}/candles?granularity=${g}`;
      }
      case "htx":
        return `${ex.url}?symbol=${s}&period=${istr}&size=${lim}`;
      case "kucoin":
        return `${ex.url}?symbol=${s}&type=${istr}&limit=${lim}`;
      default:
        return null;
    }
  }
  _clampLimit(id, limit) {
    const max = {
      binance: 1000,
      mexc: 1000,
      bybit: 1000,
      okx: 300,
      coinbase: 300,
      htx: 2000,
      kucoin: 1500,
    };
    return Math.min(limit, max[id] || 1000);
  }
  _parse(data, id) {
    try {
      let raw = [];
      switch (id) {
        case "binance":
        case "mexc":
          raw = Array.isArray(data)
            ? data.map((k) => ({
                time: utils.toMs(k[0]),
                open: +k[1],
                high: +k[2],
                low: +k[3],
                close: +k[4],
                volume: +k[5],
              }))
            : [];
          break;
        case "bybit":
          raw =
            data.result?.list?.map((k) => ({
              time: utils.toMs(k[0]),
              open: +k[1],
              high: +k[2],
              low: +k[3],
              close: +k[4],
              volume: +k[5],
            })) || [];
          break;
        case "okx":
          raw =
            data.data?.map((k) => ({
              time: utils.toMs(k[0]),
              open: +k[1],
              high: +k[2],
              low: +k[3],
              close: +k[4],
              volume: +k[5],
            })) || [];
          break;
        case "coinbase":
          raw = Array.isArray(data)
            ? data.map((k) => ({
                time: utils.toMs(k[0]),
                open: +k[3],
                high: +k[2],
                low: +k[1],
                close: +k[4],
                volume: +k[5],
              }))
            : [];
          break;
        case "htx":
          raw =
            data.data?.map((k) => ({
              time: utils.toMs(k.id ?? k[0]),
              open: +(k.open ?? k[1]),
              high: +(k.high ?? k[2]),
              low: +(k.low ?? k[3]),
              close: +(k.close ?? k[4]),
              volume: +(k.vol ?? k.amount ?? k[5]),
            })) || [];
          break;
        case "kucoin":
          raw =
            data.data?.map((k) => ({
              time: utils.toMs(k[0]),
              open: +k[1],
              close: +k[2],
              high: +k[3],
              low: +k[4],
              volume: +k[5],
            })) || [];
          break;
        default:
          return [];
      }
      return this._normalizeCandles(raw);
    } catch (e) {
      return [];
    }
  }
  _normalizeCandles(candles) {
    const byTime = new Map();
    for (const c of candles) {
      if (!c || !Number.isFinite(c.time) || !Number.isFinite(c.close)) continue;
      const e = byTime.get(c.time);
      if (e) {
        e.high = Math.max(e.high, c.high);
        e.low = Math.min(e.low, c.low);
        e.close = c.close;
        e.volume = Math.max(e.volume, c.volume);
      } else byTime.set(c.time, c);
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
}

// ---------- IndicatorCalculator ----------
class IndicatorCalculator {
  constructor() {
    this.cache = new Map();
  }

  calculateAll(candles, tf) {
    if (!candles || candles.length < CONFIG.minCandlesRequired) return null;
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);

    const rsi = this._rsi(closes, CONFIG.indicators.rsiPeriod);
    const currentRSI = rsi.length ? rsi[rsi.length - 1] : 50;

    const macd = this._macd(
      closes,
      CONFIG.indicators.macdFast,
      CONFIG.indicators.macdSlow,
      CONFIG.indicators.macdSignal,
    );
    const hist = macd.histogram;
    const currentHist = hist.length ? hist[hist.length - 1] : 0;
    const currentMACD = macd.macd.length ? macd.macd[macd.macd.length - 1] : 0;
    const currentSignal = macd.signal.length
      ? macd.signal[macd.signal.length - 1]
      : 0;
    const prevHist = hist.length > 1 ? hist[hist.length - 2] : currentHist;

    const ema8 = this._ema(closes, 8);
    const ema13 = this._ema(closes, 13);
    const ema21 = this._ema(closes, 21);
    const ema50 = this._ema(closes, 50);
    const e8 = ema8.length ? ema8[ema8.length - 1] : closes[closes.length - 1];
    const e13 = ema13.length
      ? ema13[ema13.length - 1]
      : closes[closes.length - 1];
    const e21 = ema21.length
      ? ema21[ema21.length - 1]
      : closes[closes.length - 1];
    const e50 = ema50.length
      ? ema50[ema50.length - 1]
      : closes[closes.length - 1];

    const atrArr = this._atr(candles, CONFIG.indicators.atrPeriod);
    const atr = atrArr.length ? atrArr[atrArr.length - 1] : 0.01;

    const poc = this._poc(candles);
    const cvdArr = this._cvd(candles);
    const cvd = cvdArr.length ? cvdArr[cvdArr.length - 1] : 0;
    const cvdPrev = cvdArr.length > 1 ? cvdArr[cvdArr.length - 2] : cvd;

    const bb = this._bb(
      closes,
      CONFIG.indicators.bbPeriod,
      CONFIG.indicators.bbStdDev,
    );
    const bbUpper = bb.upper.length
      ? bb.upper[bb.upper.length - 1]
      : closes[closes.length - 1] * 1.05;
    const bbLower = bb.lower.length
      ? bb.lower[bb.lower.length - 1]
      : closes[closes.length - 1] * 0.95;
    const bbMiddle = bb.middle.length
      ? bb.middle[bb.middle.length - 1]
      : closes[closes.length - 1];
    const bbWidth = (bbUpper - bbLower) / (bbMiddle || 1);

    const vol = volumes[volumes.length - 1] || 0;
    const volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
    const close = closes[closes.length - 1];
    const trendStrength = (close - e50) / (atr || 0.01);

    // NW Envelope (endpoint)
    const nw = this._nwEnvelope(candles);

    return {
      rsi: currentRSI,
      macdHist: currentHist,
      macdLine: currentMACD,
      macdSignal: currentSignal,
      macdPrevHist: prevHist,
      ema8: e8,
      ema13: e13,
      ema21: e21,
      ema50: e50,
      atr,
      poc,
      cvd,
      cvdPrev,
      bbUpper,
      bbLower,
      bbMiddle,
      bbWidth,
      volume: vol,
      volAvg,
      close,
      trendStrength,
      nw,
    };
  }

  _rsi(data, period) {
    if (data.length < period + 1) return [50];
    const ch = [];
    for (let i = 1; i < data.length; i++) ch.push(data[i] - data[i - 1]);
    let ag = 0,
      al = 0;
    const len = Math.min(period, ch.length);
    for (let i = 0; i < len; i++) {
      if (ch[i] >= 0) ag += ch[i];
      else al += Math.abs(ch[i]);
    }
    ag /= period;
    al /= period || 1;
    const rsi = [100 - 100 / (1 + ag / (al || 1))];
    for (let i = period; i < ch.length; i++) {
      const g = ch[i] >= 0 ? ch[i] : 0;
      const l = ch[i] < 0 ? Math.abs(ch[i]) : 0;
      ag = (ag * (period - 1) + g) / period;
      al = (al * (period - 1) + l) / period;
      rsi.push(100 - 100 / (1 + ag / (al || 1)));
    }
    return rsi;
  }
  _ema(data, period) {
    if (!data.length) return [];
    const ema = [];
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        sum += data[i];
        ema.push(sum / (i + 1));
      } else ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }
  _macd(data, fast, slow, signal) {
    if (data.length < slow + signal)
      return { macd: [], signal: [], histogram: [] };
    const ef = this._ema(data, fast);
    const es = this._ema(data, slow);
    const macdLine = ef.map((v, i) => v - es[i]);
    const macdForSignal = macdLine.slice(slow - 1);
    const signalLine = this._ema(macdForSignal, signal);
    const histogram = macdForSignal.map((v, i) => v - signalLine[i]);
    return { macd: macdForSignal, signal: signalLine, histogram };
  }
  _atr(candles, period) {
    if (candles.length < period + 1) return [0.01];
    const tr = [];
    for (let i = 1; i < candles.length; i++) {
      const h = candles[i].high,
        l = candles[i].low,
        pc = candles[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atr = [];
    let sum = 0;
    for (let i = 0; i < tr.length; i++) {
      if (i < period) {
        sum += tr[i];
        atr.push(sum / (i + 1));
      } else atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
  }
  _poc(candles) {
    if (!candles.length) return 0;
    const minP = Math.min(...candles.map((c) => c.low));
    const maxP = Math.max(...candles.map((c) => c.high));
    const bs = (maxP - minP) / 50 || 0.01;
    const levels = new Map();
    candles.forEach((c) => {
      const b = Math.floor((c.close - minP) / bs);
      levels.set(b, (levels.get(b) || 0) + c.volume);
    });
    let mv = 0,
      bb = 0;
    for (const [b, v] of levels)
      if (v > mv) {
        mv = v;
        bb = b;
      }
    return minP + (bb + 0.5) * bs;
  }
  _cvd(candles) {
    if (candles.length < 2) return [];
    const cvd = [];
    let cum = 0;
    for (let i = 1; i < candles.length; i++) {
      const ch = candles[i].close - candles[i - 1].close;
      const vol = candles[i].volume;
      const delta =
        ch > 0
          ? vol * (ch / candles[i - 1].close)
          : ch < 0
            ? -vol * (Math.abs(ch) / candles[i - 1].close)
            : 0;
      cum += delta;
      cvd.push(cum);
    }
    return cvd;
  }
  _bb(data, period, sd) {
    if (data.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [],
      middle = [],
      lower = [];
    for (let i = period - 1; i < data.length; i++) {
      const s = data.slice(i - period + 1, i + 1);
      const m = s.reduce((a, b) => a + b, 0) / period;
      const v = s.reduce((a, b) => a + (b - m) ** 2, 0) / period;
      const st = Math.sqrt(v);
      middle.push(m);
      upper.push(m + sd * st);
      lower.push(m - sd * st);
    }
    return { upper, middle, lower };
  }

  // ============================================================
  //  NADARAYA-WATSON ENVELOPE — ENDPOINT (NON-REPAINTING) MODE
  //  Возвращает { out, upper, lower, mae, position, prevLower, prevUpper }
  //  где out = сглаженное значение на текущем баре (использует только
  //  текущий и прошлые бары, ядро одностороннее).
  //  position: "below" | "inside" | "above" — где close относительно полос.
  // ============================================================
  _nwEnvelope(candles) {
    const cfg = CONFIG.indicators.nw;
    const n = candles.length;
    if (n < cfg.minCandles) return null;

    const closes = candles.map((c) => c.close);
    const window = Math.min(cfg.window, n);
    const h = cfg.h;
    const mult = cfg.mult;

    // Предрасчёт весов ядра (одностороннее: j = 0..window-1 назад)
    const kernel = new Float64Array(window);
    for (let j = 0; j < window; j++) {
      kernel[j] = Math.exp(-(j * j) / (2 * h * h));
    }

    // Сглаженное значение для индекса idx (endpoint)
    const smoothAt = (idx) => {
      let sum = 0,
        sw = 0;
      const maxJ = Math.min(window, idx + 1);
      for (let j = 0; j < maxJ; j++) {
        sum += closes[idx - j] * kernel[j];
        sw += kernel[j];
      }
      return sw > 0 ? sum / sw : closes[idx];
    };

    // Считаем "out" для текущего бара
    const curIdx = n - 1;
    const out = smoothAt(curIdx);

    // MAE за последние maeWindow баров (отклонение close от сглаженного)
    const maeWindow = Math.min(cfg.maeWindow, n - window);
    let sumErr = 0,
      cnt = 0;
    for (let i = 0; i < maeWindow; i++) {
      const idx = curIdx - i;
      if (idx < window) break;
      sumErr += Math.abs(closes[idx] - smoothAt(idx));
      cnt++;
    }
    const mae = cnt > 0 ? (sumErr / cnt) * mult : 0;

    const upper = out + mae;
    const lower = out - mae;

    // Позиция текущей цены
    const close = closes[curIdx];
    const position =
      close < lower ? "below" : close > upper ? "above" : "inside";

    // Для определения пересечения полос на текущем баре нужны
    // prevUpper/prevLower, посчитанные на предыдущем баре.
    // Приблизим их через тот же MAE (допустимо: MAE меняется плавно),
    // но out_prev пересчитаем честно.
    let prevUpper = null,
      prevLower = null;
    if (curIdx >= 1) {
      const outPrev = smoothAt(curIdx - 1);
      prevUpper = outPrev + mae;
      prevLower = outPrev - mae;
    }

    return { out, upper, lower, mae, position, prevUpper, prevLower, curIdx };
  }
}

// ---------- SignalGenerator ----------
class SignalGenerator {
  constructor(ic) {
    this.indicatorCalc = ic;
  }

  generate(asset, tf, candles) {
    if (!candles || candles.length < CONFIG.minCandlesRequired)
      return this._emptySignal(asset, tf);
    const ind = this.indicatorCalc.calculateAll(candles, tf);
    if (!ind) return this._emptySignal(asset, tf);

    const sc = CONFIG.scoring;
    const W = sc.weights,
      G = sc.gradations;
    const totalW = Object.values(W).reduce((s, v) => s + v, 0) || 1;

    let buyRaw = 0,
      sellRaw = 0;
    const scores = {};
    const indicatorStates = {};

    // RSI
    {
      const w = W.rsi,
        g = G.rsi,
        r = ind.rsi;
      let raw = 0;
      if (r < 10) raw = w * g.extreme;
      else if (r > 90) raw = -w * g.extreme;
      else if (r < 20) raw = w * g.strong;
      else if (r > 80) raw = -w * g.strong;
      else if (r < 30) raw = w * g.normal;
      else if (r > 70) raw = -w * g.normal;
      else if (r < 40) raw = w * g.weak;
      else if (r > 60) raw = -w * g.weak;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.rsi = (raw / totalW) * 100;
      indicatorStates.rsi = {
        value: Math.round(ind.rsi),
        bias:
          ind.rsi < 30 ? "oversold" : ind.rsi > 70 ? "overbought" : "neutral",
      };
    }

    // MACD
    {
      const w = W.macd,
        g = G.macd,
        h = ind.macdHist;
      let raw = 0;
      if (h > 0 && ind.macdLine > ind.macdSignal) raw = w * g.main;
      else if (h < 0 && ind.macdLine < ind.macdSignal) raw = -w * g.main;
      else if (h > ind.macdPrevHist) raw = w * g.trend;
      else if (h < ind.macdPrevHist) raw = -w * g.trend;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.macd = (raw / totalW) * 100;
      indicatorStates.macd = {
        value: ind.macdHist.toFixed(4),
        bias:
          h > 0 && ind.macdLine > ind.macdSignal
            ? "bullish"
            : h < 0 && ind.macdLine < ind.macdSignal
              ? "bearish"
              : h > ind.macdPrevHist
                ? "growing"
                : "falling",
      };
    }

    // EMA
    {
      const w = W.ema,
        c = ind.close;
      const fullBull =
        c > ind.ema8 &&
        ind.ema8 > ind.ema13 &&
        ind.ema13 > ind.ema21 &&
        ind.ema21 > ind.ema50;
      const fullBear =
        c < ind.ema8 &&
        ind.ema8 < ind.ema13 &&
        ind.ema13 < ind.ema21 &&
        ind.ema21 < ind.ema50;
      let raw = fullBull ? w : fullBear ? -w : 0;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.ema = (raw / totalW) * 100;
      indicatorStates.ema = {
        bias: fullBull ? "full-bull" : fullBear ? "full-bear" : "mixed",
      };
    }

    // CVD
    {
      const w = W.cvd;
      let raw = 0;
      if (ind.cvd > ind.cvdPrev && ind.cvd > 0) raw = w;
      else if (ind.cvd < ind.cvdPrev && ind.cvd < 0) raw = -w;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.cvd = (raw / totalW) * 100;
      indicatorStates.cvd = {
        value: ind.cvd.toFixed(0),
        bias:
          ind.cvd > ind.cvdPrev
            ? "rising"
            : ind.cvd < ind.cvdPrev
              ? "falling"
              : "flat",
      };
    }

    // BB
    {
      const w = W.bb,
        g = G.bb,
        c = ind.close;
      let raw = 0;
      if (c < ind.bbLower) raw = w * g.touch;
      else if (c > ind.bbUpper) raw = -w * g.touch;
      else if (ind.bbWidth < 0.1 && c > ind.bbMiddle) raw = w * g.squeeze;
      else if (ind.bbWidth < 0.1 && c < ind.bbMiddle) raw = -w * g.squeeze;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.bb = (raw / totalW) * 100;
      indicatorStates.bb = {
        width: (ind.bbWidth * 100).toFixed(1) + "%",
        position:
          c < ind.bbLower
            ? "below-lower"
            : c > ind.bbUpper
              ? "above-upper"
              : c > ind.bbMiddle
                ? "above-middle"
                : "below-middle",
        squeeze: ind.bbWidth < 0.1,
      };
    }

    // Volume
    {
      const w = W.volume,
        c = ind.close;
      const vr = ind.volume / (ind.volAvg || 1);
      let raw = 0;
      if (vr > 1.5 && c > ind.ema8) raw = w;
      else if (vr > 1.5 && c < ind.ema8) raw = -w;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.volume = (raw / totalW) * 100;
      indicatorStates.volume = { ratio: vr.toFixed(2), spike: vr > 1.5 };
    }

    // POC
    {
      const w = W.poc,
        c = ind.close;
      const atr = ind.atr || 0.01;
      const pd = Math.abs(c - ind.poc) / atr;
      let raw = 0;
      if (pd < 0.2 && c > ind.ema8) raw = w;
      else if (pd < 0.2 && c < ind.ema8) raw = -w;
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.poc = (raw / totalW) * 100;
      indicatorStates.poc = {
        value: ind.poc.toFixed(2),
        distance: ((c - ind.poc) / atr).toFixed(2) + " ATR",
        near: pd < 0.2,
      };
    }

    // NW Envelope (8-й индикатор, endpoint)
    {
      const w = W.nw;
      const nw = ind.nw;
      let raw = 0;
      if (nw) {
        const close = ind.close;
        const prevClose = candles[candles.length - 2]?.close ?? close;
        // Сигнал: пересечение нижней полосы снизу вверх → бычий (контр-тренд)
        if (
          nw.prevLower != null &&
          prevClose < nw.prevLower &&
          close >= nw.lower
        )
          raw = w;
        // Пересечение верхней полосы сверху вниз → медвежий
        else if (
          nw.prevUpper != null &&
          prevClose > nw.prevUpper &&
          close <= nw.upper
        )
          raw = -w;
        // Усиливающий сигнал: цена уже за пределами полос (без пересечения)
        else if (close < nw.lower) raw = w * 0.5;
        else if (close > nw.upper) raw = -w * 0.5;
      }
      if (raw > 0) buyRaw += raw;
      else sellRaw += -raw;
      scores.nw = (raw / totalW) * 100;
      indicatorStates.nw = nw
        ? {
            out: nw.out.toFixed(2),
            upper: nw.upper.toFixed(2),
            lower: nw.lower.toFixed(2),
            position: nw.position,
            bias: raw > 0 ? "bullish" : raw < 0 ? "bearish" : "neutral",
          }
        : {
            out: "--",
            upper: "--",
            lower: "--",
            position: "none",
            bias: "neutral",
          };
    }

    const netRaw = buyRaw - sellRaw;
    const netScore = (netRaw / totalW) * 100;
    const confidence = Math.round(utils.clamp(Math.abs(netScore), 0, 100));

    const scoresPct = {};
    for (const k of Object.keys(scores))
      scoresPct[k] = Math.round(scores[k] * 10) / 10;

    const buyAligned = this._isEntryAligned(ind, "BUY");
    const sellAligned = this._isEntryAligned(ind, "SELL");
    const htfBuy = this._htfConfirms(tf, candles, "BUY");
    const htfSell = this._htfConfirms(tf, candles, "SELL");

    let scoreDirection = "NEUTRAL";
    if (netScore > sc.strongThreshold && ind.trendStrength > -1)
      scoreDirection = "BUY";
    else if (netScore < -sc.strongThreshold && ind.trendStrength < 1)
      scoreDirection = "SELL";

    let direction = "NEUTRAL";
    if (
      buyAligned &&
      htfBuy &&
      confidence >= CONFIG.trading.minConfidence &&
      netScore > sc.strongThreshold
    )
      direction = "BUY";
    else if (
      sellAligned &&
      htfSell &&
      confidence >= CONFIG.trading.minConfidence &&
      netScore < -sc.strongThreshold
    )
      direction = "SELL";

    const actionProbs = this._calcActionProbs(
      buyRaw,
      sellRaw,
      ind.trendStrength,
      ind.bbWidth,
      totalW,
    );

    return {
      asset,
      timeframe: tf,
      direction,
      scoreDirection,
      confidence,
      price: ind.close,
      atr: ind.atr,
      htfTimeframe: this._htfFor(tf),
      htfConfirmed:
        direction === "BUY" ? htfBuy : direction === "SELL" ? htfSell : false,
      timestamp: Date.now(),
      indicators: {
        rsi: Math.round(ind.rsi),
        macd: ind.macdHist.toFixed(4),
        ema8: ind.ema8.toFixed(2),
        ema50: ind.ema50.toFixed(2),
        atr: ind.atr.toFixed(2),
        bbWidth: (ind.bbWidth * 100).toFixed(1),
        trendStrength: ind.trendStrength.toFixed(2),
        nw: ind.nw ? ind.nw.out.toFixed(2) : "--",
      },
      actionProbabilities: actionProbs,
      indicatorScores: scoresPct,
      indicatorStates,
      status: "Активен",
    };
  }

  _isEntryAligned(ind, side) {
    const r = ind.rsi;
    const mr = ind.macdHist > ind.macdPrevHist;
    const mf = ind.macdHist < ind.macdPrevHist;
    const c = CONFIG.trading;
    if (side === "BUY")
      return ind.close > ind.ema50 && mr && r < c.rsiOverbought;
    return ind.close < ind.ema50 && mf && r > c.rsiOversold;
  }
  _htfFor(tf) {
    const m = CONFIG.tfMinutes[tf] || 60;
    if (m < CONFIG.tfMinutes["4h"]) return "4h";
    if (m < CONFIG.tfMinutes["1d"]) return "1d";
    return null;
  }
  _htfConfirms(tf, candles, side) {
    if (!CONFIG.trading.requireHtfConfirm) return true;
    const htf = this._htfFor(tf);
    if (!htf) return true;
    const agg = utils.aggregateCandles(candles, htf);
    if (!agg || agg.length < CONFIG.minCandlesRequired) return false;
    const ind = this.indicatorCalc.calculateAll(agg, htf);
    if (!ind) return false;
    return side === "BUY" ? ind.close > ind.ema50 : ind.close < ind.ema50;
  }
  _calcActionProbs(buyRaw, sellRaw, ts, bw, tw) {
    const d = tw || 1;
    let bp = Math.min((buyRaw / d) * 100, 100);
    let sp = Math.min((sellRaw / d) * 100, 100);
    if (bw < 0.05) {
      bp *= 0.7;
      sp *= 0.7;
    }
    if (Math.abs(ts) > 2) {
      if (ts > 0) {
        bp = Math.min(bp * 1.3, 100);
        sp *= 0.7;
      } else {
        sp = Math.min(sp * 1.3, 100);
        bp *= 0.7;
      }
    }
    const wp = Math.max(100 - (bp + sp), 0);
    return {
      wait: Math.round(utils.clamp(wp, 0, 100)),
      buy: Math.round(utils.clamp(bp, 0, 100)),
      sell: Math.round(utils.clamp(sp, 0, 100)),
    };
  }
  _emptySignal(asset, tf) {
    const safeTf = tf || CONFIG.defaultTF;
    const emptyScores = {
      rsi: 0,
      macd: 0,
      ema: 0,
      cvd: 0,
      bb: 0,
      volume: 0,
      poc: 0,
      nw: 0,
    };
    const emptyStates = {
      rsi: { value: 0, bias: "neutral" },
      macd: { value: "0.0000", bias: "flat" },
      ema: { bias: "mixed" },
      cvd: { value: "0", bias: "flat" },
      bb: { width: "0%", position: "above-middle", squeeze: false },
      volume: { ratio: "0.00", spike: false },
      poc: { value: "0", distance: "0 ATR", near: false },
      nw: {
        out: "--",
        upper: "--",
        lower: "--",
        position: "none",
        bias: "neutral",
      },
    };
    return {
      asset,
      timeframe: safeTf,
      direction: "NEUTRAL",
      scoreDirection: "NEUTRAL",
      confidence: 0,
      price: 0,
      atr: 0,
      htfTimeframe: this._htfFor(safeTf),
      htfConfirmed: false,
      timestamp: Date.now(),
      indicators: {
        rsi: 0,
        macd: "0",
        ema8: "0",
        ema50: "0",
        atr: "0",
        bbWidth: "0",
        trendStrength: "0",
        nw: "--",
      },
      actionProbabilities: { wait: 100, buy: 0, sell: 0 },
      indicatorScores: emptyScores,
      indicatorStates: emptyStates,
      status: "⏳ Загрузка...",
    };
  }
}

// ---------- Backtester ----------
class Backtester {
  constructor(sg) {
    this.signalGen = sg;
    this.tradeHistory = [];
  }
  async run(asset, candles, tf) {
    if (!candles || candles.length < 100) return [];
    const agg = utils.aggregateCandles(candles, tf);
    if (agg.length < 100) return [];
    const trades = [];
    let position = null;
    const c = CONFIG.trading;
    const STEP = 3;
    for (let i = 100; i < agg.length; i += STEP) {
      const win = agg.slice(0, i + 1);
      const cur = agg[i];
      const price = cur.close;
      const sig = this.signalGen.generate(asset, tf, win);
      if (position) {
        const move =
          position.direction === "BUY"
            ? price - position.entryPrice
            : position.entryPrice - price;
        const opp =
          sig &&
          sig.confidence >= c.minConfidence &&
          ((position.direction === "BUY" && sig.direction === "SELL") ||
            (position.direction === "SELL" && sig.direction === "BUY"));
        if (move >= position.takeProfitDistance) {
          trades.push(this._close(position, price, cur.time, "take_profit"));
          position = null;
        } else if (move <= -position.stopDistance) {
          trades.push(this._close(position, price, cur.time, "stop_loss"));
          position = null;
        } else if (i - (position.entryIndex ?? i) > 50) {
          trades.push(this._close(position, price, cur.time, "timeout"));
          position = null;
        } else if (opp) {
          trades.push(this._close(position, price, cur.time, "reverse_signal"));
          position = null;
        }
      }
      if (
        !position &&
        sig &&
        (sig.direction === "BUY" || sig.direction === "SELL") &&
        sig.confidence >= c.minConfidence
      ) {
        const lv = this._atrLevels(price, sig.atr, c);
        position = {
          asset,
          direction: sig.direction,
          entryPrice: price,
          entryTime: cur.time,
          entryConfidence: sig.confidence,
          entryIndex: i,
          stopDistance: lv.stopDistance,
          takeProfitDistance: lv.takeProfitDistance,
        };
      }
    }
    if (position) {
      const last = agg[agg.length - 1];
      trades.push(this._close(position, last.close, last.time, "timeout"));
    }
    this.tradeHistory = trades.sort((a, b) => b.exitTime - a.exitTime);
    return this.tradeHistory;
  }
  computeStats(trades) {
    const l = trades || [];
    const t = l.length;
    if (t === 0)
      return { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, winRate: 0 };
    const w = l.filter((x) => x.profit > 0).length;
    const ls = l.filter((x) => x.profit < 0).length;
    const p = l.reduce((s, x) => s + x.profit, 0);
    return {
      totalTrades: t,
      wins: w,
      losses: ls,
      totalProfit: p,
      winRate: (w / t) * 100,
    };
  }
  _atrLevels(ep, atr, c) {
    const n = Number(atr);
    const ok = Number.isFinite(n) && n > 0;
    return {
      stopDistance: ok ? c.stopAtrMult * n : ep * (c.maxLossPercent / 100),
      takeProfitDistance: ok
        ? c.takeProfitAtrMult * n
        : ep * (c.minProfitPercent / 100),
    };
  }
  _close(pos, exitPrice, exitTime, reason) {
    const pp = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const profit = pos.direction === "BUY" ? pp : -pp;
    return {
      asset: pos.asset || "UNKNOWN",
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryTime: pos.entryTime,
      exitTime,
      profitPercent: profit,
      profit: (profit / 100) * CONFIG.trading.positionSize,
      confidence: pos.entryConfidence,
      exitReason: reason,
    };
  }
}

// ---------- WSManager ----------
class WSManager {
  constructor(onKline) {
    this.onKline = onKline;
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxAttempts = 10;
    this._stopped = false;
    this._skipReconnect = false;
    this.onStatus = null;
  }
  connect() {
    this._stopped = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      this._skipReconnect = true;
      this.ws.close();
    }
    const streams = CONFIG.assets
      .map((a) => CONFIG.symbolMap[a].toLowerCase() + "@kline_1m")
      .join("/");
    try {
      this.ws = new WebSocket(
        `wss://stream.binance.com:9443/stream?streams=${streams}`,
      );
      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        if (this.onStatus) this.onStatus(true);
      };
      this.ws.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data);
          const d = p.data || p;
          if (d && d.k) this.onKline(d);
        } catch (e) {}
      };
      this.ws.onclose = () => {
        this.connected = false;
        if (this.onStatus) this.onStatus(false);
        if (this._skipReconnect) {
          this._skipReconnect = false;
          return;
        }
        if (this._stopped) return;
        this._reconnect();
      };
      this.ws.onerror = () => {};
    } catch (e) {
      this._reconnect();
    }
  }
  _reconnect() {
    if (this._stopped || this.reconnectAttempts >= this.maxAttempts) return;
    this.reconnectAttempts++;
    const d = Math.min(1000 * this.reconnectAttempts, 30000);
    setTimeout(() => {
      if (!this.connected && !this._stopped) this.connect();
    }, d);
  }
  close() {
    this._stopped = true;
    if (this.ws) this.ws.close();
  }
}

// ---------- FearGreedManager ----------
class FearGreedManager {
  constructor({ intervalMs = 5 * 60 * 1000, neutralFallback = 50 } = {}) {
    this.intervalMs = intervalMs;
    this.neutralFallback = neutralFallback;
    this._el = { marker: null, value: null };
    this._lastValue = -1;
    this._rafId = null;
    this._timerId = null;
    this._abort = null;
  }
  start() {
    this._el.marker = document.getElementById("fngMarker");
    this._el.value = document.getElementById("fngValue");
    if (!this._el.marker || !this._el.value) return;
    this._set(this.neutralFallback);
    this._fetch();
    this._timerId = setInterval(() => this._fetch(), this.intervalMs);
  }
  stop() {
    if (this._timerId) clearInterval(this._timerId);
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._abort) this._abort.abort();
  }
  async _fetch() {
    if (this._abort) this._abort.abort();
    this._abort = new AbortController();
    const sources = [
      "https://api.alternative.me/fng/?limit=1&format=json",
      "https://corsproxy.io/?" +
        encodeURIComponent("https://api.alternative.me/fng/?limit=1"),
      "https://api.allorigins.win/raw?url=" +
        encodeURIComponent("https://api.alternative.me/fng/?limit=1"),
    ];
    for (const url of sources) {
      try {
        const r = await fetch(url, {
          signal: this._abort.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        const raw = j?.data?.[0]?.value ?? j?.value;
        const v = parseInt(raw, 10);
        if (Number.isFinite(v)) {
          this._set(v);
          return;
        }
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    this._set(this.neutralFallback);
  }
  _set(v) {
    const c = Math.max(0, Math.min(100, v));
    if (c === this._lastValue) return;
    this._lastValue = c;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => {
      const { marker, value } = this._el;
      if (marker) marker.style.left = c + "%";
      if (value) {
        value.textContent = `${c} ${this._classify(c)}`;
        let color = "#fbbf24";
        if (c < 25) color = "#ef4444";
        else if (c < 45) color = "#f97316";
        else if (c < 55) color = "#fbbf24";
        else if (c < 75) color = "#84cc16";
        else color = "#22c55e";
        value.style.color = color;
      }
    });
  }
  _classify(v) {
    if (v < 25) return "Extreme Fear";
    if (v < 45) return "Fear";
    if (v < 55) return "Neutral";
    if (v < 75) return "Greed";
    return "Extreme Greed";
  }
}

// ---------- MarketStateWidget ----------
class MarketStateWidget {
  static CONFIG = {
    containerId: "market-state-widget",
    refreshMs: 5 * 60 * 1000,
    cacheTTL: 4 * 60 * 1000,
    cacheKey: "ms_widget_cache_v2",
    timeout: 8000,
    weights: {
      macro: { liquidity: 0.4, leverage: 0.3, breadth: 0.3 },
      liquidity: { volume: 0.4, mcap: 0.3, volatility: 0.3 },
      leverage: { funding: 0.4, oi: 0.35, lsRatio: 0.25 },
      breadth: { dominance: 0.4, altseason: 0.35, gainers: 0.25 },
    },
  };
  constructor(opts = {}) {
    this.cfg = { ...MarketStateWidget.CONFIG, ...opts };
    this._timer = null;
    this._loading = false;
    this._lastData = null;
    this._container = null;
    this._isOpen = false;
    this._isDocsOpen = false;
    this._onDocClick = (e) => {
      if (!this._isOpen || !this._container) return;
      const t = e.target;
      if (t instanceof Element) {
        if (this._container.contains(t)) return;
        if (t.closest(".tf-btn")) return;
        if (t.closest(".tf-arrow-wrap")) return;
        if (t.closest("#tf-guide-panel")) return;
      }
      this._close();
    };
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._isOpen) this._close();
    };
  }
  start() {
    this._container = document.getElementById(this.cfg.containerId);
    if (!this._container) return;
    this._renderSkeleton();
    const cached = this._getCache();
    if (cached) {
      this._lastData = cached;
      this._render(cached);
    }
    this._refresh();
    this._timer = setInterval(() => this._refresh(), this.cfg.refreshMs);
    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
  }
  stop() {
    if (this._timer) clearInterval(this._timer);
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
  }
  refreshNow() {
    return this._refresh(true);
  }
  _toggle() {
    this._isOpen ? this._close() : this._open();
  }
  _open() {
    this._isOpen = true;
    this._container?.querySelector(".ms-compact")?.classList.add("ms-open");
    this._container
      ?.querySelector(".ms-dropdown-wrap")
      ?.classList.add("ms-open");
  }
  _close() {
    this._isOpen = false;
    this._isDocsOpen = false;
    this._container?.querySelector(".ms-compact")?.classList.remove("ms-open");
    this._container
      ?.querySelector(".ms-dropdown-wrap")
      ?.classList.remove("ms-open");
    this._container
      ?.querySelector(".ms-docs-panel")
      ?.classList.remove("ms-open");
    this._container
      ?.querySelector(".ms-docs-arrow")
      ?.classList.remove("ms-open");
  }
  _toggleDocs() {
    this._isDocsOpen = !this._isDocsOpen;
    this._container
      ?.querySelector(".ms-docs-panel")
      ?.classList.toggle("ms-open", this._isDocsOpen);
    this._container
      ?.querySelector(".ms-docs-arrow")
      ?.classList.toggle("ms-open", this._isDocsOpen);
  }
  _clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  _map(v, a, b, c = 0, d = 100) {
    if (b === a) return c;
    return c + this._clamp((v - a) / (b - a), 0, 1) * (d - c);
  }
  _log10(v) {
    return Math.log(Math.max(v, 1)) / Math.log(10);
  }
  _fmtNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "--";
    if (Math.abs(v) >= 1e12) return (v / 1e12).toFixed(1) + "T";
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(2);
  }
  _fmtTime(ts) {
    return new Date(ts).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  async _fetchJSON(url) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), this.cfg.timeout);
    try {
      const r = await fetch(url, {
        signal: c.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  async _fetchAll() {
    const t = await Promise.allSettled([
      this._fetchJSON("https://api.coingecko.com/api/v3/global"),
      this._fetchJSON(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h",
      ),
      this._fetchJSON(
        "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",
      ),
      this._fetchJSON(
        "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=24",
      ),
      this._fetchJSON(
        "https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1",
      ),
    ]);
    const g = t[0].status === "fulfilled" ? t[0].value : {};
    const c = t[1].status === "fulfilled" ? t[1].value : [];
    const p = t[2].status === "fulfilled" ? t[2].value : {};
    const oh = t[3].status === "fulfilled" ? t[3].value : [];
    const ls = t[4].status === "fulfilled" ? t[4].value : [];
    const btc = Array.isArray(c) ? c.find((x) => x.symbol === "btc") : null;
    const d = g?.data || {};
    return {
      totalMcap: d.total_market_cap?.usd || 0,
      totalVolume: d.total_volume?.usd || 0,
      btcDominance: d.market_cap_percentage?.btc || 0,
      mcapChange24h: d.market_cap_change_percentage_24h_usd || 0,
      btcChange24h: btc?.price_change_percentage_24h || 0,
      fundingRate: parseFloat(p?.lastFundingRate) || 0,
      lsRatio: parseFloat(ls?.[0]?.longShortRatio) || 1.0,
      oiHist: Array.isArray(oh) ? oh : [],
      topCoins: Array.isArray(c) ? c : [],
    };
  }
  _normVolume(v) {
    return this._map(this._log10(v / 1e9), this._log10(30), this._log10(300));
  }
  _normMcap(v) {
    return this._map(this._log10(v / 1e12), this._log10(0.8), this._log10(4));
  }
  _normVolatility(ch) {
    return this._clamp(100 - Math.abs(ch) * 8, 0, 100);
  }
  _normFunding(r) {
    const x = r * 100,
      ax = Math.abs(x),
      s = x >= 0 ? 1 : -1;
    const e = this._clamp((ax / 0.1) * 50, 0, 50);
    return this._clamp(50 + s * (50 - e), 0, 100);
  }
  _normOI(h) {
    if (!h || h.length < 2) return 50;
    const f = parseFloat(h[0].sumOpenInterest) || 1;
    const l = parseFloat(h[h.length - 1].sumOpenInterest) || f;
    const ch = ((l - f) / f) * 100;
    if (ch >= 20) return 30;
    if (ch >= 10) return 60;
    if (ch >= 0) return 70;
    if (ch >= -10) return 55;
    return 40;
  }
  _normLS(r) {
    if (r >= 2.5) return 25;
    if (r >= 1.8) return 50;
    if (r >= 1.2) return 70;
    if (r >= 0.8) return 80;
    if (r >= 0.5) return 50;
    return 25;
  }
  _normDominance(d) {
    if (d >= 65) return 30;
    if (d >= 55) return 50;
    if (d >= 48) return 75;
    if (d >= 40) return 85;
    return 70;
  }
  _normAltseason(btcCh, coins) {
    if (!coins || coins.length < 10) return 50;
    const top50 = coins.slice(0, 50);
    const b = top50.filter(
      (x) => (x.price_change_percentage_24h || 0) > btcCh,
    ).length;
    return this._clamp((b / top50.length) * 100, 0, 100);
  }
  _normGainers(coins) {
    if (!coins || !coins.length) return 50;
    const u = coins.filter(
      (x) => (x.price_change_percentage_24h || 0) > 0,
    ).length;
    return this._clamp((u / coins.length) * 100, 0, 100);
  }
  _computeScores(m) {
    const w = this.cfg.weights;
    const liquidity = Math.round(
      this._normVolume(m.totalVolume) * w.liquidity.volume +
        this._normMcap(m.totalMcap) * w.liquidity.mcap +
        this._normVolatility(m.mcapChange24h) * w.liquidity.volatility,
    );
    const leverage = Math.round(
      this._normFunding(m.fundingRate) * w.leverage.funding +
        this._normOI(m.oiHist) * w.leverage.oi +
        this._normLS(m.lsRatio) * w.leverage.lsRatio,
    );
    const breadth = Math.round(
      this._normDominance(m.btcDominance) * w.breadth.dominance +
        this._normAltseason(m.btcChange24h, m.topCoins) * w.breadth.altseason +
        this._normGainers(m.topCoins) * w.breadth.gainers,
    );
    const macro = Math.round(
      liquidity * w.macro.liquidity +
        leverage * w.macro.leverage +
        breadth * w.macro.breadth,
    );
    return { liquidity, leverage, breadth, macro };
  }
  _getCache() {
    try {
      const r = localStorage.getItem(this.cfg.cacheKey);
      if (!r) return null;
      const o = JSON.parse(r);
      if (Date.now() - o.ts > this.cfg.cacheTTL) return null;
      return o.data;
    } catch {
      return null;
    }
  }
  _setCache(d) {
    try {
      localStorage.setItem(
        this.cfg.cacheKey,
        JSON.stringify({ ts: Date.now(), data: d }),
      );
    } catch {}
  }
  async _refresh() {
    if (this._loading) return;
    this._loading = true;
    this._setStatus("loading");
    try {
      const raw = await this._fetchAll();
      const scores = this._computeScores(raw);
      const data = { ...raw, scores, ts: Date.now() };
      this._lastData = data;
      this._setCache(data);
      this._render(data);
      this._setStatus("ok");
    } catch (e) {
      this._setStatus("error");
      if (!this._lastData) this._renderFallback();
    } finally {
      this._loading = false;
    }
  }
  _scaleInfo(v) {
    const x = utils.clamp(Math.round(v), 0, 100);
    for (const s of MACRO_SCALE) if (x >= s.min && x <= s.max) return s;
    return MACRO_SCALE[MACRO_SCALE.length - 1];
  }
  _scoreClass(v) {
    return this._scaleInfo(v).barClass;
  }
  _scoreColor(v) {
    return this._scaleInfo(v).color;
  }
  _buildDocsHtml() {
    return `
      <h3>СОСТОЯНИЕ РЫНКА</h3>
      <p>Виджет агрегирует 3 композитных индекса (Ликвидность, Плечо, Широта) в 1 итоговый Macro Score. Каждый индекс и Macro находятся в диапазоне 0–100.</p>
      <h4>Как читать баллы</h4>
      <ul>
        <li>75–100 🟢 Очень здоровый</li><li>55–74 🟡 Здоровый</li>
        <li>40–54 🟠 Осторожно</li><li>20–39 🔴 Риск</li><li>0–19 🔴 Экстрим</li>
      </ul>
      <h4>1. Ликвидность</h4><p>«Толщина» рынка.</p>
      <h4>2. Плечо</h4><p>Объём кредитных сделок.</p>
      <h4>3. Широта</h4><p>Количество активов.</p>
      <h4>ПОКАЗАТЕЛИ</h4>
      <p><strong>Funding BTC</strong> — ставка финансирования.</p>
      <p><strong>Long/Short</strong> — соотношение счетов.</p>
      <p><strong>BTC Dom</strong> — доминирование BTC.</p>
      <p><strong>MCap 24h</strong> — изменение капитализации.</p>
      <p><strong>Объём 24h</strong> — объём торгов за сутки.</p>
      <p><strong>Капитализация</strong> — общая капитализация.</p>
      <h4>Macro = Ликвидность × 0.4 + Плечо × 0.3 + Широта × 0.3</h4>`;
  }
  _renderSkeleton() {
    this._container.innerHTML = `
      <div class="ms-compact" title="Состояние рынка">
        <span class="ms-compact-dot ms-loading"></span>
        <span class="ms-compact-label">СОСТОЯНИЕ РЫНКА</span>
        <span class="ms-compact-value" style="color:#94a3b8;">--</span>
        <span class="ms-compact-arrow">▶</span>
      </div>
      <div class="ms-dropdown-wrap">
        <div class="ms-panel">
          <div class="ms-panel-header">
            <div class="ms-panel-title">СОСТОЯНИЕ РЫНКА</div>
            <div class="ms-panel-macro">
              <span class="ms-panel-macro-value" style="color:#94a3b8;">--</span>
              <span class="ms-panel-macro-label">Macro</span>
            </div>
          </div>
          <div class="ms-heatmap">
            ${["Ликвидность", "Плечо", "Широта"]
              .map(
                (l) => `
              <div class="ms-row">
                <span class="ms-row-label">${l}</span>
                <div class="ms-bar-track"><div class="ms-bar-fill ms-blue"></div></div>
                <span class="ms-bar-value">--</span>
              </div>`,
              )
              .join("")}
          </div>
        </div>
        <div class="ms-docs-panel">
          <div class="ms-docs-header">
            <span>ДОКУМЕНТАЦИЯ</span>
            <button class="ms-docs-close" type="button">✕</button>
          </div>
          <div class="ms-docs-content"></div>
        </div>
      </div>`;
    this._bindEvents();
  }
  _render(data) {
    const s = data.scores;
    const mInfo = this._scaleInfo(s.macro);
    const compactHtml = `
      <div class="ms-compact" title="Состояние рынка">
        <span class="ms-compact-dot" id="ms-status-dot"></span>
        <span class="ms-compact-label">СОСТОЯНИЕ РЫНКА</span>
        <span class="ms-compact-value" style="color:${mInfo.color};">${s.macro}</span>
        <span class="ms-compact-arrow">▶</span>
      </div>`;
    const rows = [
      { label: "Ликвидность", val: s.liquidity },
      { label: "Плечо", val: s.leverage },
      { label: "Широта", val: s.breadth },
    ];
    const rowsHtml = rows
      .map(
        (r) => `
      <div class="ms-row">
        <span class="ms-row-label">${r.label}</span>
        <div class="ms-bar-track">
          <div class="ms-bar-fill ${this._scoreClass(r.val)}" style="width:${r.val}%"></div>
        </div>
        <span class="ms-bar-value" style="color:${this._scoreColor(r.val)};">${r.val}</span>
      </div>`,
      )
      .join("");
    const fundPct = (data.fundingRate * 100).toFixed(4);
    const fundCls =
      data.fundingRate > 0.0005 || data.fundingRate < -0.0005 ? "neg" : "pos";
    const lsStr = data.lsRatio.toFixed(2);
    const lsCls = data.lsRatio > 2.2 || data.lsRatio < 0.6 ? "neg" : "pos";
    const btcDom = data.btcDominance.toFixed(1);
    const mc = data.mcapChange24h.toFixed(2);
    const mcCls = data.mcapChange24h >= 0 ? "pos" : "neg";
    const panelHtml = `
      <div class="ms-dropdown-wrap">
        <div class="ms-panel">
          <div class="ms-panel-header">
            <div class="ms-panel-title">Состояние рынка</div>
            <div class="ms-panel-macro">
              <span class="ms-panel-macro-value" style="color:${mInfo.color};">${s.macro}</span>
              <span class="ms-panel-macro-label">${mInfo.label}</span>
            </div>
          </div>
          <div class="ms-heatmap">${rowsHtml}</div>
          <div class="ms-details">
            <div class="ms-detail"><span>Funding BTC</span><span class="ms-detail-val ${fundCls}">${fundPct}%</span></div>
            <div class="ms-detail"><span>Long/Short</span><span class="ms-detail-val ${lsCls}">${lsStr}</span></div>
            <div class="ms-detail"><span>BTC Dom</span><span class="ms-detail-val">${btcDom}%</span></div>
            <div class="ms-detail"><span>MCap 24h</span><span class="ms-detail-val ${mcCls}">${mc}%</span></div>
            <div class="ms-detail"><span>Объём 24h</span><span class="ms-detail-val">$${this._fmtNum(data.totalVolume)}</span></div>
            <div class="ms-detail"><span>Капитализация</span><span class="ms-detail-val">$${this._fmtNum(data.totalMcap)}</span></div>
          </div>
          <div class="ms-panel-footer">
            <div class="ms-panel-update">
              <span class="ms-dot" id="ms-status-dot"></span>
              <span id="ms-update-time">${this._fmtTime(data.ts || Date.now())}</span>
            </div>
            <button class="ms-refresh-btn" id="ms-refresh-btn" type="button">↻ Обновить</button>
            <button class="ms-docs-btn" id="ms-docs-btn" type="button">ДОКУМЕНТАЦИЯ<span class="ms-compact-arrow ms-docs-arrow">▼</span></button>
          </div>
        </div>
        <div class="ms-docs-panel">
          <div class="ms-docs-header">
            <span>ДОКУМЕНТАЦИЯ</span>
            <button class="ms-docs-close" type="button">✕</button>
          </div>
          <div class="ms-docs-content">${this._buildDocsHtml()}</div>
        </div>
      </div>`;
    this._container.innerHTML = compactHtml + panelHtml;
    if (this._isOpen) this._open();
    if (this._isDocsOpen) {
      this._container.querySelector(".ms-docs-panel")?.classList.add("ms-open");
      this._container.querySelector(".ms-docs-arrow")?.classList.add("ms-open");
    }
    this._bindEvents();
  }
  _renderFallback() {
    this._render({
      scores: { liquidity: 50, leverage: 50, breadth: 50, macro: 50 },
      fundingRate: 0,
      lsRatio: 1,
      btcDominance: 50,
      mcapChange24h: 0,
      totalVolume: 0,
      totalMcap: 0,
      ts: Date.now(),
    });
    this._setStatus("error");
  }
  _bindEvents() {
    const compact = this._container.querySelector(".ms-compact");
    const refresh = this._container.querySelector("#ms-refresh-btn");
    const docs = this._container.querySelector("#ms-docs-btn");
    const close = this._container.querySelector(".ms-docs-close");
    if (compact)
      compact.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggle();
      });
    if (refresh)
      refresh.addEventListener("click", (e) => {
        e.stopPropagation();
        this.refreshNow();
      });
    if (docs)
      docs.addEventListener("click", (e) => {
        e.stopPropagation();
        this._toggleDocs();
      });
    if (close)
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        this._isDocsOpen = false;
        this._container
          .querySelector(".ms-docs-panel")
          ?.classList.remove("ms-open");
        this._container
          .querySelector(".ms-docs-arrow")
          ?.classList.remove("ms-open");
      });
  }
  _setStatus(status) {
    const dot = this._container?.querySelector("#ms-status-dot");
    const time = this._container?.querySelector("#ms-update-time");
    const cd = this._container?.querySelector(".ms-compact-dot");
    if (dot) {
      dot.className = "ms-dot";
      if (status === "loading") dot.classList.add("ms-loading");
      else if (status === "error") dot.classList.add("ms-error");
    }
    if (cd) {
      cd.className = "ms-compact-dot";
      if (status === "loading") cd.classList.add("ms-loading");
      else if (status === "error") cd.classList.add("ms-error");
    }
    if (time && status === "ok") time.textContent = this._fmtTime(Date.now());
  }
}

// ---------- TFGuidePanel ----------
class TFGuidePanel {
  constructor() {
    this._isOpen = false;
    this._el = { trigger: null, wrap: null, body: null, closeBtn: null };
    this._currentTF = CONFIG.defaultTF;
    this._onDocClick = (e) => {
      if (!this._isOpen) return;
      const t = e.target;
      if (t instanceof Element) {
        if (this._el.trigger && this._el.trigger.contains(t)) return;
        if (t.closest(".tf-btn")) return;
        if (this._el.closeBtn && this._el.closeBtn.contains(t)) return;
        if (this._el.wrap && this._el.wrap.contains(t)) return;
      }
      this.close();
    };
    this._onKeyDown = (e) => {
      if (e.key === "Escape" && this._isOpen) this.close();
    };
  }
  init() {
    this._el.trigger = document.querySelector(".tf-arrow");
    this._el.wrap = document.getElementById("tf-guide-panel");
    this._el.body = document.getElementById("tf-guide-body");
    this._el.closeBtn = document.querySelector(".tf-guide-panel-close");
    if (!this._el.trigger || !this._el.wrap || !this._el.body) return;
    this._renderCard(this._currentTF);
    this._el.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    if (this._el.closeBtn)
      this._el.closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
      });
    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeyDown);
  }
  destroy() {
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeyDown);
  }
  setTF(tf) {
    this._currentTF = tf;
    this._renderCard(tf);
  }
  toggle() {
    this._isOpen ? this.close() : this.open();
  }
  open() {
    this._isOpen = true;
    this._el.wrap?.classList.add("ms-open");
    this._el.trigger?.classList.add("active");
  }
  close() {
    this._isOpen = false;
    this._el.wrap?.classList.remove("ms-open");
    this._el.trigger?.classList.remove("active");
  }
  _renderCard(tf) {
    const g = TF_GUIDES[tf];
    if (!g || !this._el.body) return;
    this._el.body.innerHTML = `
      <div class="doc-card doc-card-extended" data-tf="${tf}">
        <div class="tf-name">${g.icon} ${g.name}</div>
        ${g.tagline ? `<div class="tf-tagline">${g.tagline}</div>` : ""}
        ${g.description ? `<div class="doc-section doc-section-desc">${g.description}</div>` : ""}
        ${g.entryDescription ? `<div class="doc-section doc-section-entry">${g.entryDescription}</div>` : ""}
        ${g.waitDescription ? `<div class="doc-section doc-section-wait">${g.waitDescription}</div>` : ""}
        <div class="doc-section doc-section-actions">
          <div style="margin:4px 0; font-size:11px;"><span class="action-buy">▲ BUY:</span> ${g.action.BUY}</div>
          <div style="margin:4px 0; font-size:11px;"><span class="action-sell">▼ SELL:</span> ${g.action.SELL}</div>
          <div style="margin:4px 0; font-size:11px;"><span class="action-wait">⏸️ WAIT:</span> ${g.action.WAIT}</div>
        </div>
        <div class="doc-section doc-section-params">
          <div><span class="risk-label">Риск:</span> <span class="risk-value">${g.risk}</span></div>
          <div><span class="risk-label">Плечо:</span> <span class="risk-value" style="color:#fbbf24;">${g.leverage}</span></div>
          <div><span class="risk-label">Размер:</span> <span class="risk-value">${g.positionSize}</span></div>
          <div><span class="risk-label">Стоп:</span> <span class="risk-value" style="color:#f87171;">${g.stopLoss}</span></div>
          <div><span class="risk-label">Профит:</span> <span class="risk-value" style="color:#34d399;">${g.takeProfit}</span></div>
          ${g.holdTime ? `<div><span class="risk-label">Удержание:</span> <span class="risk-value">${g.holdTime}</span></div>` : ""}
        </div>
        ${g.proTip ? `<div class="doc-section doc-section-tip">💡 <b>Совет профи:</b> ${g.proTip}</div>` : ""}
      </div>`;
  }
}

// ---------- UIRenderer ----------
class UIRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error("Контейнер не найден");
    this.cards = {};
    this.soundManager = null;
    this.currentTF = CONFIG.defaultTF;
    this.signals = new Map();
    this.tradeHistory = [];
    this.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
    };
    this._lastSignalKey = {};
    this.tfGuide = new TFGuidePanel();
  }
  setSoundManager(sm) {
    this.soundManager = sm;
  }
  render() {
    this.container.innerHTML = this._buildHTML();
    this._cacheElements();
    this._bindEvents();
    this.tfGuide.init();
    return this;
  }
  _buildHTML() {
    const cards = CONFIG.assets
      .map(
        (a) => `
      <div class="signal-card neutral" data-asset="${a}">
        <div class="signal-strength-badge"></div>
        <div class="card-header">
          <span class="asset-name">${a}</span>
          <span class="asset-price">--</span>
        </div>
        <div class="card-body">
          <span class="signal-direction">⏳ Ожидание</span>
          <span class="signal-confidence">--%</span>
        </div>
        <div class="indicators-grid">
          ${["rsi", "macd", "ema", "cvd", "bb", "volume", "poc", "nw"]
            .map(
              (ind) => `
            <div class="indicator-item" data-indicator="${ind}">
              <span class="ind-label">${this._indLabel(ind)}</span>
              <div class="indicator-bar-wrap">
                <div class="indicator-bar-fill neutral" style="width:0%"></div>
              </div>
              <span class="ind-value neutral">--</span>
            </div>`,
            )
            .join("")}
        </div>
        <div class="action-indicators">
          <div class="action-indicator wait" data-action="wait">
            <span class="label">⏸️ Ждать</span>
            <span class="value">0%</span>
            <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
          </div>
          <div class="action-indicator buy" data-action="buy">
            <span class="label">▲ Купить</span>
            <span class="value">0%</span>
            <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
          </div>
          <div class="action-indicator sell" data-action="sell">
            <span class="label">🔻 Продать</span>
            <span class="value">0%</span>
            <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
          </div>
        </div>
        <div class="card-footer">
          <span class="tf-signal">--</span>
        </div>
      </div>`,
      )
      .join("");

    return `
      <div class="crypto-signal-widget">
        <div class="widget-header">
          <div>
            <span class="widget-title">⚛ CRYPTO SIGNAL TOOL ⚛</span>
            <span class="widget-version"><b>v10.4</b> • 8 индикаторов • 7 бирж</span>
          </div>
          <div class="widget-status-group">
            <div class="sound-controls">
              <button class="sound-toggle active" id="sound-toggle">🔊<span class="sound-label">Вкл</span></button>
              <span class="sound-status" id="sound-status"><span class="sound-indicator on"></span></span>
              <span class="sound-info">≥75%</span>
            </div>
            <div class="ws-status-group">
              <span class="ws-status" id="ws-status">⚡ Подключение...</span>
              <span class="last-update" id="last-update">--:--:--</span>
            </div>
          </div>
        </div>

        <div class="tf-group" id="tf-group">
          <div class="tf-arrow-wrap">
            <button class="tf-arrow" type="button" data-tf="◂">◂</button>
            <div class="tf-guide-panel" id="tf-guide-panel">
              <div class="tf-guide-panel-header">
                <span>ГАЙД ТАЙМФРЕЙМА</span>
                <button class="tf-guide-panel-close" type="button">✕</button>
              </div>
              <div class="tf-guide-panel-body" id="tf-guide-body"></div>
            </div>
          </div>
          ${CONFIG.timeframes.map((tf) => `<button class="tf-btn ${tf === CONFIG.defaultTF ? "active" : ""}" data-tf="${tf}">${tf}</button>`).join("")}
          <div class="signal-count-item">⚡ <span id="signal-count">0</span> сигналов</div>
          <div class="fng-widget" id="fngWidget">
            <span class="fng-label">СТРАХ & ЖАДНОСТЬ</span>
            <div class="fng-track"><div class="fng-marker" id="fngMarker"></div></div>
            <span class="fng-value" id="fngValue">50 Neutral</span>
          </div>
          <div class="ms-inline-slot"><div id="market-state-widget"></div></div>
        </div>

        <div class="signal-grid" id="signal-grid">${cards}</div>

        <div class="trade-history-section">
          <div class="trade-history-header">
            <div class="trade-history-title">ИСТОРИЯ ТОРГОВЛИ (backtesting)</div>
            <div class="trade-history-stats" id="trade-stats">
              <div class="stat-item">Всего: <span class="stat-value total" id="stat-total">0</span></div>
              <div class="stat-item">Win: <span class="stat-value win" id="stat-wins">0</span></div>
              <div class="stat-item">Loss: <span class="stat-value loss" id="stat-losses">0</span></div>
              <div class="stat-item">Win Rate: <span class="stat-value" id="stat-winrate" style="color:#fbbf24;">0%</span></div>
              <div class="stat-item">P/L: <span class="stat-value" id="stat-pl" style="color:#94a3b8;">$0</span></div>
            </div>
          </div>
          <div class="trade-history-grid" id="trade-history-grid">
            <div style="grid-column:1/-1; text-align:center; color:#475569; font-size:12px; padding:20px;">⏳ Загрузка...</div>
          </div>
        </div>

        <div class="widget-footer">
          <div class="footer-stat">🎯 >75% Сильный</div>
          <div class="footer-stat">💾 <span id="cache-status">Кэш</span></div>
          <div class="footer-stat"><span id="connection-info">WebSocket</span></div>
          <div class="footer-stat"><span id="history-status">История</span></div>
          <div class="footer-stat">⚡<span id="asset-count">${CONFIG.assets.length} активов</span></div>
        </div>

        <div class="docs-wrapper">
          <details>
            <summary>ДОКУМЕНТАЦИЯ</summary>
            <div class="docs-content">${this._buildDocs()}</div>
          </details>
        </div>
      </div>`;
  }
  _buildDocs() {
    const w = CONFIG.scoring.weights;
    const tw = Object.values(w).reduce((s, v) => s + v, 0) || 1;
    const pct = (k) => Math.round((w[k] / tw) * 100);
    const cards = CONFIG.timeframes
      .map((tf) => {
        const g = TF_GUIDES[tf];
        if (!g) return "";
        return `
        <div class="doc-card doc-card-extended" data-tf="${tf}">
          <div class="tf-name">${g.icon} ${g.name}</div>
          ${g.tagline ? `<div class="tf-tagline">${g.tagline}</div>` : ""}
          ${g.description ? `<div class="doc-section doc-section-desc">${g.description}</div>` : ""}
          ${g.entryDescription ? `<div class="doc-section doc-section-entry">${g.entryDescription}</div>` : ""}
          ${g.waitDescription ? `<div class="doc-section doc-section-wait">${g.waitDescription}</div>` : ""}
          <div class="doc-section doc-section-actions">
            <div style="margin:4px 0; font-size:11px;"><span class="action-buy">▲ BUY:</span> ${g.action.BUY}</div>
            <div style="margin:4px 0; font-size:11px;"><span class="action-sell">🔻 SELL:</span> ${g.action.SELL}</div>
            <div style="margin:4px 0; font-size:11px;"><span class="action-wait">⏸️ WAIT:</span> ${g.action.WAIT}</div>
          </div>
          <div class="doc-section doc-section-params">
            <div><span class="risk-label">Риск:</span> <span class="risk-value">${g.risk}</span></div>
            <div><span class="risk-label">Плечо:</span> <span class="risk-value" style="color:#fbbf24;">${g.leverage}</span></div>
            <div><span class="risk-label">Размер:</span> <span class="risk-value">${g.positionSize}</span></div>
            <div><span class="risk-label">Стоп:</span> <span class="risk-value" style="color:#f87171;">${g.stopLoss}</span></div>
            <div><span class="risk-label">Профит:</span> <span class="risk-value" style="color:#34d399;">${g.takeProfit}</span></div>
            ${g.holdTime ? `<div><span class="risk-label">Удержание:</span> <span class="risk-value">${g.holdTime}</span></div>` : ""}
          </div>
          ${g.proTip ? `<div class="doc-section doc-section-tip">💡 <b>Совет профи:</b> ${g.proTip}</div>` : ""}
        </div>`;
      })
      .join("");

    return `
      <div class="documentation-content">
        <span>Данное приложение — это мощный инструмент для принятия торговых решений, но не гарантия прибыли. Это профессиональный торговый терминал для криптовалют, который объединяет 8 лучших технических индикаторов в единую систему генерации сигналов.</span><br>
        <p>Приложение работает в реальном времени, анализируя данные 8 индикаторов с 7 криптобирж (Binance, Bybit, OKX, MEXC, Coinbase, HTX, KuCoin)</p>
      </div><br>
      <span><b>Для более точного анализа используются следующие таймфреймы:</b></span>
      <br>
      <div class="doc-legend">
        <span class="legend-item"><span class="legend-dot buy-dot"></span> BUY</span>
        <span class="legend-item"><span class="legend-dot sell-dot"></span> SELL</span>
        <span class="legend-item"><span class="legend-dot wait-dot"></span> WAIT</span>
        <span class="legend-item"><span class="legend-dot strong-dot"></span> Strong (>75%)</span>
        <span class="legend-item" style="color:#fbbf24;">🔊 Звук при ≥75%</span>
      </div>
      <div style="margin-top:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;font-size:11px;color:#94a3b8;">
        <strong style="color:#e2e8f0;">📌 Общие правила:</strong><br>
        • 15m — только для скальпинга (опытные трейдеры)<br>
        • 1H и 2H — для уточнения точек входа<br>
        • 4H — основной TF для входа<br>
        • 1D — долгосрочные инвестиции<br>
        • Всегда используйте стоп-лосс!<br>
        • Риск ≤ 2-3% депозита на сделку <br>
        • Диверсифицируйте активы (не более 30% в один актив) <br>
        • Не используйте маржинальное кредитование <br>
      </div>
      <br>
      <span><b>РАСШИФРОВКА 8 ИНДИКАТОРОВ</b> (веса настраиваются в CONFIG.scoring.weights, итог автонормируется к 100%)<br>
        RSI — вес ${w.rsi} → ${pct("rsi")}%<br>
        MACD — вес ${w.macd} → ${pct("macd")}%<br>
        EMA Ribbon — вес ${w.ema} → ${pct("ema")}%<br>
        CVD — вес ${w.cvd} → ${pct("cvd")}%<br>
        Bollinger — вес ${w.bb} → ${pct("bb")}%<br>
        Volume — вес ${w.volume} → ${pct("volume")}%<br>
        POC — вес ${w.poc} → ${pct("poc")}%<br>
        NW Env — вес ${w.nw} → ${pct("nw")}% <em style="color:#64748b;">(endpoint, non-repainting)</em>
      </span>
      <br>
      <br>
      <span>
          <strong>МЕРЦАНИЕ</strong><br>
          60-64% Слабая • 65-69% Средняя • 70-74% Сильная • 75-79% Очень сильная • 80%+ Экстремальная
      </span>
      <br>
      <span><b>NW Envelope:</b> контр-трендовый сигнал на пересечении полос (kernel regression, h=8, mult=3, window=500).</span>
      <br><br>;
  }
  _indLabel(ind) {
    const m = {
      rsi: "RSI",
      macd: "MACD",
      ema: "EMA",
      cvd: "CVD",
      bb: "BB",
      volume: "VOL",
      poc: "POC",
      nw: "NW Env",
    };
    return m[ind] || ind;
  }
  _cacheElements() {
    this.el = {
      status: document.getElementById("ws-status"),
      lastUpdate: document.getElementById("last-update"),
      signalCount: document.getElementById("signal-count"),
      cacheStatus: document.getElementById("cache-status"),
      connectionInfo: document.getElementById("connection-info"),
      historyGrid: document.getElementById("trade-history-grid"),
      historyStatus: document.getElementById("history-status"),
      soundToggle: document.getElementById("sound-toggle"),
      tfGroup: document.getElementById("tf-group"),
      statTotal: document.getElementById("stat-total"),
      statWins: document.getElementById("stat-wins"),
      statLosses: document.getElementById("stat-losses"),
      statWinrate: document.getElementById("stat-winrate"),
      statPl: document.getElementById("stat-pl"),
    };
    this.cards = {};
    document.querySelectorAll(".signal-card").forEach((c) => {
      this.cards[c.dataset.asset] = c;
    });
  }
  _bindEvents() {
    if (this.el.soundToggle) {
      this.el.soundToggle.addEventListener("click", () => {
        if (this.soundManager) {
          const en = this.soundManager.toggle();
          this.el.soundToggle.className = `sound-toggle ${en ? "active" : "muted"}`;
          this.el.soundToggle.innerHTML = `${en ? "🔊" : "🔇"}<span class="sound-label">${en ? "Вкл" : "Выкл"}</span>`;
        }
      });
    }
    if (this.el.tfGroup) {
      this.el.tfGroup.addEventListener("click", (e) => {
        const btn = e.target.closest(".tf-btn");
        if (!btn) return;
        this.el.tfGroup
          .querySelectorAll(".tf-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentTF = btn.dataset.tf;
        this.tfGuide.setTF(this.currentTF);
        if (this.onTFChange) this.onTFChange(this.currentTF);
      });
    }
  }
  updateSignal(asset, signal) {
    this.signals.set(asset, signal);
    const card = this.cards[asset];
    if (!card) return;
    const priceEl = card.querySelector(".asset-price");
    if (priceEl && signal.price)
      priceEl.textContent = `$${signal.price.toFixed(2)}`;

    const dirEl = card.querySelector(".signal-direction");
    const confEl = card.querySelector(".signal-confidence");
    const dispDir = signal.scoreDirection || signal.direction;
    if (dirEl) {
      let icon = "⏸️",
        color = "#94a3b8",
        bg = "rgba(255,255,255,0.05)";
      if (dispDir === "BUY") {
        icon = "🟢";
        color = "#34d399";
        bg = "rgba(52,211,153,0.15)";
      } else if (dispDir === "SELL") {
        icon = "🔻";
        color = "#f87171";
        bg = "rgba(248,113,113,0.15)";
      }
      dirEl.textContent = `${icon} ${dispDir}`;
      dirEl.style.background = bg;
      dirEl.style.color = color;
    }
    if (confEl) {
      const c = signal.confidence || 0;
      confEl.textContent = c > 0 ? `${c}%` : "--%";
      confEl.style.color =
        c >= 75
          ? "#34d399"
          : c >= 60
            ? "#fbbf24"
            : c >= 45
              ? "#f59e0b"
              : "#475569";
    }

    this._updateIndicators(
      card,
      signal.indicatorScores,
      signal.indicatorStates,
    );
    this._updateActions(card, signal.actionProbabilities);
    this._updateBadgeAndGlow(card, dispDir, signal.confidence);

    const tfEl = card.querySelector(".tf-signal");
    if (tfEl && signal.indicators) {
      tfEl.textContent = `RSI:${signal.indicators.rsi} | MACD:${signal.indicators.macd} | NW:${signal.indicators.nw}`;
    }

    if (
      this.soundManager &&
      signal.confidence >= CONFIG.sound.threshold &&
      dispDir !== "NEUTRAL"
    ) {
      const key = `${asset}-${dispDir}-${signal.confidence}`;
      if (this._lastSignalKey[asset] !== key) {
        this.soundManager.stopRepeating(asset);
        this.soundManager.startRepeating(asset, dispDir, signal.confidence);
        this._lastSignalKey[asset] = key;
      }
    } else if (this.soundManager) {
      this.soundManager.stopRepeating(asset);
      delete this._lastSignalKey[asset];
    }
  }

  // === Нормализация по весу + нейтральные значения (8 индикаторов) ===
  _updateIndicators(card, scores, states) {
    if (!scores) return;
    const weights = CONFIG.scoring.weights;
    const totalW = Object.values(weights).reduce((s, v) => s + v, 0) || 1;
    const items = card.querySelectorAll(".indicator-item");
    const keys = ["rsi", "macd", "ema", "cvd", "bb", "volume", "poc", "nw"];

    items.forEach((item, idx) => {
      const key = keys[idx];
      const score = scores[key] || 0;
      const state = states?.[key];
      const valueEl = item.querySelector(".ind-value");
      const barFill = item.querySelector(".indicator-bar-fill");
      const labelEl = item.querySelector(".ind-label");
      if (!valueEl || !barFill) return;

      const maxScore = (weights[key] / totalW) * 100;
      const normalizedPct =
        maxScore > 0 ? Math.min((Math.abs(score) / maxScore) * 100, 100) : 0;

      let cls = "neutral";
      let display;

      if (score > 0) {
        display = `+${Math.round(normalizedPct)}%`;
        cls = normalizedPct >= 75 ? "strong-bullish" : "bullish";
      } else if (score < 0) {
        display = `-${Math.round(normalizedPct)}%`;
        cls = normalizedPct >= 75 ? "strong-bearish" : "bearish";
      } else if (state) {
        display = this._formatNeutralState(key, state);
        cls = "neutral";
      } else {
        display = "--";
      }

      valueEl.textContent = display;
      valueEl.className = `ind-value ${cls}`;

      // barFill: только bullish/bearish/neutral (в CSS нет strong-*)
      const barCls = cls.includes("bullish")
        ? "bullish"
        : cls.includes("bearish")
          ? "bearish"
          : "neutral";
      barFill.classList.remove("neutral", "bullish", "bearish");
      barFill.classList.add(barCls);
      barFill.style.width = `${normalizedPct}%`;

      if (labelEl && state) labelEl.title = this._formatTooltip(key, state);
    });
  }

  _formatNeutralState(key, s) {
    switch (key) {
      case "rsi":
        return String(s.value ?? "--");
      case "macd":
        return s.bias === "growing" ? "↗" : s.bias === "falling" ? "↘" : "→";
      case "ema":
        return s.bias === "mixed" ? "≈" : "→";
      case "cvd":
        return s.bias === "rising" ? "↗" : s.bias === "falling" ? "↘" : "→";
      case "bb":
        return s.squeeze ? "≋" : s.width || "--";
      case "volume":
        return `${s.ratio ?? "--"}x`;
      case "poc":
        return s.near ? "◎" : s.distance || "--";
      case "nw": {
        // положение цены относительно полос
        if (s.position === "below") return "▼";
        if (s.position === "above") return "▲";
        if (s.position === "inside") return "◎";
        return "--";
      }
      default:
        return "--";
    }
  }

  _formatTooltip(key, s) {
    switch (key) {
      case "rsi":
        return `RSI: ${s.value} (${s.bias})`;
      case "macd":
        return `MACD hist: ${s.value} (${s.bias})`;
      case "ema":
        return `EMA Ribbon: ${s.bias}`;
      case "cvd":
        return `CVD: ${s.value} (${s.bias})`;
      case "bb":
        return `BB width: ${s.width}, pos: ${s.position}${s.squeeze ? ", SQUEEZE" : ""}`;
      case "volume":
        return `Volume ratio: ${s.ratio}x${s.spike ? " 🔥 SPIKE" : ""}`;
      case "poc":
        return `POC: ${s.value}, dist: ${s.distance}`;
      case "nw":
        return `NW Env: out=${s.out}, upper=${s.upper}, lower=${s.lower}, pos=${s.position}`;
      default:
        return "";
    }
  }

  _updateActions(card, probs) {
    if (!probs) return;
    card.querySelectorAll(".action-indicator").forEach((el) => {
      const a = el.dataset.action;
      const v = el.querySelector(".value");
      const b = el.querySelector(".bar-fill");
      if (!v || !b) return;
      const p = probs[a] || 0;
      v.textContent = `${p}%`;
      b.style.width = `${p}%`;
      el.classList.toggle("active", p > 30);
    });
  }

  _updateBadgeAndGlow(card, dir, conf) {
    const badge = card.querySelector(".signal-strength-badge");
    card.classList.remove(
      "buy-60",
      "buy-65",
      "buy-70",
      "buy-75",
      "buy-80",
      "sell-60",
      "sell-65",
      "sell-70",
      "sell-75",
      "sell-80",
      "neutral",
    );
    if (badge) {
      badge.className = "signal-strength-badge";
      badge.textContent = "";
    }
    if (dir === "NEUTRAL" || conf < 60) {
      card.classList.add("neutral");
      return;
    }
    const isBuy = dir === "BUY";
    let sc = "",
      bt = "",
      bc = "";
    if (conf >= 80) {
      sc = isBuy ? "buy-80" : "sell-80";
      bt = isBuy ? "🔥 BUY" : "🔥 SELL";
      bc = isBuy ? "buy-strong" : "sell-strong";
    } else if (conf >= 75) {
      sc = isBuy ? "buy-75" : "sell-75";
      bt = isBuy ? "💪 BUY 75+" : "💪 SELL 75+";
      bc = isBuy ? "buy-strong" : "sell-strong";
    } else if (conf >= 70) {
      sc = isBuy ? "buy-70" : "sell-70";
      bt = isBuy ? "🟢 BUY 70+" : "🔻 SELL 70+";
      bc = isBuy ? "buy" : "sell";
    } else if (conf >= 65) {
      sc = isBuy ? "buy-65" : "sell-65";
      bt = isBuy ? "🟢 BUY 65+" : "🔻 SELL 65+";
      bc = isBuy ? "buy" : "sell";
    } else {
      sc = isBuy ? "buy-60" : "sell-60";
      bt = isBuy ? "🟢 BUY 60+" : "🔻 SELL 60+";
      bc = isBuy ? "buy" : "sell";
    }
    card.classList.add(sc);
    if (badge) {
      badge.textContent = bt;
      badge.className = `signal-strength-badge visible ${bc}`;
    }
  }

  updateTradeHistory(h, s) {
    this.tradeHistory = h || [];
    this.stats = s || {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
    };
    this._renderHistory();
    this._updateStatsUI();
  }
  _renderHistory() {
    const g = this.el.historyGrid;
    if (!g) return;
    const t = this.tradeHistory;
    if (!t.length) {
      g.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#475569;font-size:12px;padding:20px;">📭 Нет сделок</div>`;
      return;
    }
    const d = t.slice(0, 20);
    g.innerHTML = d
      .map((x) => {
        const w = x.profit > 0;
        const p = (x.profit >= 0 ? "+" : "") + x.profit.toFixed(2) + "$";
        const dir = x.direction === "BUY" ? "🟢 BUY" : "🔻 SELL";
        const cls = x.direction === "BUY" ? "buy-badge" : "sell-badge";
        const date = new Date(x.entryTime).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
        <div class="trade-card">
          <div class="trade-info">
            <div class="trade-asset">${x.asset}</div>
            <div class="trade-detail"><span class="trade-direction-badge ${cls}">${dir}</span> conf: ${x.confidence}%</div>
            <div class="trade-detail">$${x.entryPrice.toFixed(2)} → $${x.exitPrice.toFixed(2)}</div>
            <div class="trade-time">${date}</div>
          </div>
          <div class="trade-result">
            <div class="trade-profit ${w ? "positive" : "negative"}">${p}</div>
            <div style="font-size:10px;color:#64748b;">${(x.profitPercent >= 0 ? "+" : "") + x.profitPercent.toFixed(2)}%</div>
            <div style="font-size:8px;color:#475569;margin-top:2px;">${x.exitReason === "take_profit" ? "✅ TP" : x.exitReason === "stop_loss" ? "🛑 SL" : x.exitReason === "reverse_signal" ? "🔄 REV" : "⏱️ TO"}</div>
          </div>
        </div>`;
      })
      .join("");
    if (t.length > 20)
      g.innerHTML += `<div style="grid-column:1/-1;text-align:center;color:#475569;font-size:11px;padding:8px;">+ ${t.length - 20} more...</div>`;
  }
  _updateStatsUI() {
    const s = this.stats;
    if (this.el.statTotal) this.el.statTotal.textContent = s.totalTrades;
    if (this.el.statWins) this.el.statWins.textContent = s.wins;
    if (this.el.statLosses) this.el.statLosses.textContent = s.losses;
    if (this.el.statWinrate) {
      const w = s.totalTrades ? s.winRate.toFixed(1) + "%" : "0%";
      this.el.statWinrate.textContent = w;
      this.el.statWinrate.style.color =
        s.winRate > 50 ? "#34d399" : s.winRate > 30 ? "#fbbf24" : "#f87171";
    }
    if (this.el.statPl) {
      const p = s.totalProfit;
      this.el.statPl.textContent = (p >= 0 ? "+" : "") + p.toFixed(2) + "$";
      this.el.statPl.style.color =
        p > 0 ? "#34d399" : p < 0 ? "#f87171" : "#94a3b8";
    }
  }
  setConnectionStatus(c) {
    if (this.el.status) {
      this.el.status.textContent = c ? "🟢 Live" : "🔴 Переподключение...";
      this.el.status.style.color = c ? "#34d399" : "#f87171";
    }
    if (this.el.connectionInfo) {
      this.el.connectionInfo.textContent = c ? "🟢 Подключен" : "🔴 Отключен";
      this.el.connectionInfo.style.color = c ? "#34d399" : "#f87171";
    }
  }
  setLastUpdate(t) {
    if (this.el.lastUpdate) this.el.lastUpdate.textContent = t;
  }
  setSignalCount(c) {
    if (this.el.signalCount) this.el.signalCount.textContent = c;
  }
  setCacheStatus(t) {
    if (this.el.cacheStatus) this.el.cacheStatus.textContent = t;
  }
  setHistoryStatus(t) {
    if (this.el.historyStatus) this.el.historyStatus.textContent = t;
  }
  onTFChange = null;
}

// ---------- App ----------
class App {
  constructor() {
    this.sound = new SoundManager();
    this.dataLoader = new DataLoader();
    this.indicatorCalc = new IndicatorCalculator();
    this.signalGen = new SignalGenerator(this.indicatorCalc);
    this.backtester = new Backtester(this.signalGen);
    this.ui = new UIRenderer("signal-widget");
    this.ui.setSoundManager(this.sound);
    this.ui.onTFChange = (tf) => this.onTFChange(tf);
    this.marketData = new Map();
    this.signals = new Map();
    this.currentTF = CONFIG.defaultTF;
    this.wsManager = null;
    this._updateInterval = null;
    this._historyLoaded = false;
    this._signalThrottle = null;
    this._loadingAssets = new Set();
    this._loadedTF = null;
    this.fng = new FearGreedManager(CONFIG.fearGreed);
    this.marketState = null;
  }
  async init() {
    this.ui.render();
    this.fng.start();
    this.marketState = new MarketStateWidget();
    this.marketState.start();
    this.wsManager = new WSManager((d) => this._handleKline(d));
    this.wsManager.onStatus = (c) => this.ui.setConnectionStatus(c);
    this.wsManager.connect();
    await this._loadHistoricalData();
    this._generateSignals();
    this._updateInterval = setInterval(() => this._generateSignals(), 120000);
    setInterval(
      () => this.ui.setLastUpdate(new Date().toLocaleTimeString()),
      30000,
    );
    console.log("✅ App init");
    window.__app = this;
  }
  async _loadHistoricalData() {
    const tf = this.currentTF;
    if (this._historyLoaded && this._loadedTF === tf) return;
    this.ui.setHistoryStatus("⏳ Загрузка...");
    let loaded = 0;
    for (const asset of CONFIG.assets) {
      const candles = await this.dataLoader.fetchCandles(
        CONFIG.symbolMap[asset],
        tf,
        CONFIG.historyCandles,
      );
      if (candles && candles.length) {
        this.marketData.set(asset, candles);
        loaded++;
      }
    }
    this.ui.setCacheStatus(`${loaded}/${CONFIG.assets.length}`);
    this._historyLoaded = loaded > 0;
    this._loadedTF = tf;
    if (loaded === 0) {
      this.ui.setHistoryStatus("⚠️ Нет данных");
      return;
    }
    setTimeout(() => this._runBacktest(), 500);
  }
  async _runBacktest() {
    const all = [];
    for (const a of CONFIG.assets) {
      const c = this.marketData.get(a);
      if (!c || c.length < 100) continue;
      const t = await this.backtester.run(a, c, this.currentTF);
      all.push(...t);
    }
    all.sort((a, b) => b.exitTime - a.exitTime);
    this.ui.updateTradeHistory(all, this.backtester.computeStats(all));
    this.ui.setHistoryStatus(`${all.length} сделок`);
  }
  _tfToMs(tf) {
    const m = {
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "2h": 2 * 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };
    return m[tf] || m["1h"];
  }
  _handleKline(data) {
    const k = data.k,
      sym = data.s;
    const asset = Object.keys(CONFIG.symbolMap).find(
      (a) => CONFIG.symbolMap[a] === sym,
    );
    if (!asset || !CONFIG.assets.includes(asset)) return;
    if (!this.marketData.has(asset)) this.marketData.set(asset, []);
    const candles = this.marketData.get(asset);
    const tfMs = this._tfToMs(this.currentTF);
    const bucket = Math.floor(Number(k.t) / tfMs) * tfMs;
    const last = candles[candles.length - 1];
    const lastB = last ? Math.floor(last.time / tfMs) * tfMs : null;
    if (last && lastB === bucket) {
      last.high = Math.max(last.high, +k.h);
      last.low = Math.min(last.low, +k.l);
      last.close = +k.c;
      last.volume += +k.v;
    } else if (!last || bucket > lastB) {
      candles.push({
        open: +k.o,
        high: +k.h,
        low: +k.l,
        close: +k.c,
        volume: +k.v,
        time: bucket,
      });
    }
    if (candles.length > CONFIG.maxCandles) candles.splice(0, 100);
    if (!this._signalThrottle) {
      this._signalThrottle = setTimeout(() => {
        this._generateSignals();
        this._signalThrottle = null;
      }, 30000);
    }
  }
  async onTFChange(tf) {
    this.currentTF = tf;
    this._historyLoaded = false;
    await this._loadHistoricalData();
    this._generateSignals();
  }
  _generateSignals() {
    const tf = this.currentTF;
    let active = 0;
    for (const asset of CONFIG.assets) {
      const c = this.marketData.get(asset);
      if (!c || c.length < CONFIG.minCandlesRequired) {
        if (!this._loadingAssets.has(asset)) this._loadAssetData(asset);
        continue;
      }
      const agg = utils.aggregateCandles(c, tf);
      if (!agg || agg.length < CONFIG.minCandlesRequired) continue;
      const sig = this.signalGen.generate(asset, tf, agg);
      if (sig) {
        this.signals.set(asset, sig);
        this.ui.updateSignal(asset, sig);
        if (
          (sig.scoreDirection || sig.direction) !== "NEUTRAL" &&
          sig.confidence >= 60
        )
          active++;
      }
    }
    this.ui.setSignalCount(active);
    this.ui.setLastUpdate(new Date().toLocaleTimeString());
  }
  async _loadAssetData(asset) {
    if (this._loadingAssets.has(asset)) return;
    this._loadingAssets.add(asset);
    try {
      const c = await this.dataLoader.fetchCandles(
        CONFIG.symbolMap[asset],
        this.currentTF,
        CONFIG.historyCandles,
      );
      if (c && c.length) {
        this.marketData.set(asset, c);
        this._generateSignals();
        this.ui.setCacheStatus(`📊 ${this.marketData.size}`);
      }
    } finally {
      this._loadingAssets.delete(asset);
    }
  }
  destroy() {
    if (this.wsManager) this.wsManager.close();
    if (this._updateInterval) clearInterval(this._updateInterval);
    if (this._signalThrottle) clearTimeout(this._signalThrottle);
    if (this.fng) this.fng.stop();
    if (this.marketState) this.marketState.stop();
    if (this.ui?.tfGuide) this.ui.tfGuide.destroy();
    this.sound.clearAll();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
  window.__app = app;
});
