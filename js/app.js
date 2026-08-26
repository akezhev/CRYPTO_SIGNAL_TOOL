// ============================================================
//  МОДУЛЬ CRYPTO SIGNAL WIDGET (v9.1)
//  Полная реструктуризация с оптимизациями и исправлениями
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
  defaultTF: "1h",
  wsEndpoint: "wss://stream.binance.com:9443/ws",
  maxCandles: 1000,
  historyCandles: 1500,
  minCandlesRequired: 50,
  trading: {
    minConfidence: 65,
    minProfitPercent: 1.0,
    maxLossPercent: 2.0,
    positionSize: 1000,
  },
  sound: {
    threshold: 75,
    filePath: "audio/Ding-ding.mp3",
  },
  indicators: {
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    emaPeriods: [8, 13, 21, 50],
    bbPeriod: 20,
    bbStdDev: 2,
    atrPeriod: 14,
  },
};

// ---------- Вспомогательные утилиты ----------
const utils = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  round: (v, d = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(d)) : 0;
  },
  toMs: (t) => {
    const n = Number(t);
    if (!Number.isFinite(n)) return 0;
    return n < 1e12 ? n * 1000 : n;
  },
  last: (arr) => arr[arr.length - 1],
  safeGet: (obj, path, def) => {
    try {
      return path.split(".").reduce((o, p) => o?.[p], obj) ?? def;
    } catch {
      return def;
    }
  },
};

// ---------- Менеджер звука (с fallback) ----------
class SoundManager {
  constructor() {
    this._enabled = true;
    this._loaded = false;
    this._audio = new Audio();
    this._audio.preload = "auto";
    this._audio.src = CONFIG.sound.filePath;
    this._lastPlayed = new Map();
    this._intervals = new Map();

    // Fallback – генерация через Web Audio
    this._useFallback = false;
    this._audioCtx = null;

    this._init();
  }

  _init() {
    this._audio.addEventListener("canplaythrough", () => {
      this._loaded = true;
      console.log("🔊 Звук загружен:", CONFIG.sound.filePath);
    });
    this._audio.addEventListener("error", () => {
      console.warn(
        "⚠️ Не удалось загрузить звук, используем Web Audio fallback"
      );
      this._useFallback = true;
      this._loaded = true;
      this._initWebAudio();
    });
    if (this._audio.readyState >= 3) {
      this._loaded = true;
    }
    this._loadState();
  }

  _initWebAudio() {
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio не поддерживается");
      this._loaded = false;
    }
  }

  _playFallback() {
    if (!this._audioCtx) return;
    try {
      if (this._audioCtx.state === "suspended") {
        this._audioCtx.resume().catch(() => {});
      }
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this._audioCtx.destination);
      osc.frequency.value = 800;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, this._audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this._audioCtx.currentTime + 0.2
      );
      osc.start(this._audioCtx.currentTime);
      osc.stop(this._audioCtx.currentTime + 0.2);
    } catch (e) {
      /* игнорируем */
    }
  }

  play(signalType, asset, confidence) {
    if (!this._enabled || !this._loaded || confidence < CONFIG.sound.threshold)
      return;
    const key = `${asset}-${signalType}`;
    const now = Date.now();
    if (now - (this._lastPlayed.get(key) || 0) < 10000) return;
    this._lastPlayed.set(key, now);

    try {
      if (this._useFallback) {
        this._playFallback();
      } else {
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
      }
      console.log(`🔊 ${signalType} ${asset} (${confidence}%)`);
      // очистка старых записей
      for (const [k, t] of this._lastPlayed) {
        if (now - t > 300000) this._lastPlayed.delete(k);
      }
    } catch (e) {
      /* ignore */
    }
  }

  startRepeating(asset, signalType, confidence) {
    const key = `${asset}-${signalType}`;
    if (this._intervals.has(key)) return;
    this.play(signalType, asset, confidence);
    const id = setInterval(() => {
      this.play(signalType, asset, confidence);
    }, 10000);
    this._intervals.set(key, id);
  }

  stopRepeating(asset) {
    for (const [key, id] of this._intervals) {
      if (key.startsWith(`${asset}-`)) {
        clearInterval(id);
        this._intervals.delete(key);
      }
    }
    for (const [key] of this._lastPlayed) {
      if (key.startsWith(`${asset}-`)) this._lastPlayed.delete(key);
    }
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

  isEnabled() {
    return this._enabled;
  }
  isLoaded() {
    return this._loaded;
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

// ---------- Загрузчик данных (исправлен: преобразование символов, повторные попытки) ----------
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

  // Преобразование символа в формат, ожидаемый биржей
  _formatSymbol(exchangeId, symbol) {
    switch (exchangeId) {
      case "binance":
      case "bybit":
      case "mexc":
        return symbol; // BTCUSDT
      case "kucoin":
        return symbol.replace("USDT", "-USDT").replace("BUSD", "-BUSD");
      case "okx":
        return symbol.replace("USDT", "-USDT").replace("BUSD", "-BUSD");
      case "coinbase":
        return symbol.replace("USDT", "-USD").replace("BUSD", "-USD");
      case "htx":
        return symbol.toLowerCase();
      default:
        return symbol;
    }
  }

  async fetchCandles(symbol, interval = "1h", limit = CONFIG.historyCandles) {
    const intervalMap = {
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

    // Сначала пробуем Binance, затем остальные (только объекты бирж)
    const orderedExchanges = [
      this.exchanges.find((e) => e.id === "binance"),
      ...this.exchanges.filter((e) => e.id !== "binance"),
    ].filter(Boolean);

    for (const ex of orderedExchanges) {
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const formattedSymbol = this._formatSymbol(ex.id, symbol);
          const intervalStr = intervalMap[interval]?.[ex.id] || "1h";
          const url = this._buildUrl(ex, formattedSymbol, intervalStr, limit);
          if (!url) continue;

          console.log(
            `📥 Загрузка ${symbol} с ${ex.id} (${formattedSymbol})...`
          );
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeout);
          const resp = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            console.warn(
              `❌ ${ex.id} вернул ${resp.status} для ${formattedSymbol}`
            );
            if (
              resp.status >= 400 &&
              resp.status < 500 &&
              resp.status !== 429
            ) {
              break;
            }
            continue;
          }

          const data = await resp.json();
          const candles = this._parse(data, ex.id);
          if (candles && candles.length >= CONFIG.minCandlesRequired) {
            console.log(
              `✅ Загружено ${candles.length} свечей с ${ex.id} для ${symbol}`
            );
            return candles;
          } else {
            console.warn(
              `⚠️ ${ex.id} вернул мало данных (${candles?.length || 0})`
            );
          }
        } catch (e) {
          console.warn(
            `⚠️ Попытка ${attempt + 1} для ${ex.id} не удалась:`,
            e.message
          );
          if (attempt < this.maxRetries - 1) {
            await utils.sleep(1000 * (attempt + 1));
          }
        }
      }
    }

    console.error(
      `❌ Не удалось загрузить данные для ${symbol} ни с одной биржи`
    );
    return [];
  }

  _buildUrl(ex, symbol, intervalStr, limit) {
    const lim = this._clampLimit(ex.id, limit);
    let url = "";
    switch (ex.id) {
      case "binance":
        url = `${ex.url}?symbol=${symbol}&interval=${intervalStr}&limit=${lim}`;
        break;
      case "bybit":
        url = `${ex.url}?symbol=${symbol}&interval=${intervalStr}&limit=${lim}`;
        break;
      case "okx":
        url = `${ex.url}?instId=${symbol}&bar=${intervalStr}&limit=${lim}`;
        break;
      case "mexc":
        url = `${ex.url}?symbol=${symbol}&interval=${intervalStr}&limit=${lim}`;
        break;
      case "coinbase": {
        const granularity =
          intervalStr === "1h"
            ? 3600
            : intervalStr === "15m"
            ? 900
            : intervalStr === "2h"
            ? 7200
            : intervalStr === "4h"
            ? 14400
            : 86400;
        url = `${ex.url}/${symbol}/candles?granularity=${granularity}`;
        break;
      }
      case "htx":
        url = `${ex.url}?symbol=${symbol}&period=${intervalStr}&size=${lim}`;
        break;
      case "kucoin":
        url = `${ex.url}?symbol=${symbol}&type=${intervalStr}&limit=${lim}`;
        break;
      default:
        return null;
    }
    return url;
  }

  _clampLimit(exId, limit) {
    const max = {
      binance: 1000,
      mexc: 1000,
      bybit: 1000,
      okx: 300,
      coinbase: 300,
      htx: 2000,
      kucoin: 1500,
    };
    return Math.min(limit, max[exId] || 1000);
  }

  _parse(data, exId) {
    try {
      let raw = [];
      switch (exId) {
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
      console.warn("Ошибка парсинга данных от", exId, e);
      return [];
    }
  }

  _normalizeCandles(candles) {
    const byTime = new Map();
    for (const c of candles) {
      if (!c || !Number.isFinite(c.time) || !Number.isFinite(c.close)) continue;
      byTime.set(c.time, c);
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
}

// ---------- Расчёт индикаторов (чистые функции, с кэшированием) ----------
class IndicatorCalculator {
  constructor() {
    this.cache = new Map(); // key: `${asset}_${tf}`, value: { rsi, macd, ema, cvd, bb, poc, atr, ... }
  }

  getCached(asset, tf) {
    return this.cache.get(`${asset}_${tf}`);
  }

  setCached(asset, tf, data) {
    this.cache.set(`${asset}_${tf}`, data);
  }

  calculateAll(candles, tf) {
    if (!candles || candles.length < CONFIG.minCandlesRequired) return null;
    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const len = closes.length;

    // RSI
    const rsi = this._rsi(closes, CONFIG.indicators.rsiPeriod);
    const currentRSI = rsi.length ? rsi[rsi.length - 1] : 50;

    // MACD
    const macd = this._macd(
      closes,
      CONFIG.indicators.macdFast,
      CONFIG.indicators.macdSlow,
      CONFIG.indicators.macdSignal
    );
    const hist = macd.histogram;
    const currentHist = hist.length ? hist[hist.length - 1] : 0;
    const currentMACD = macd.macd.length ? macd.macd[macd.macd.length - 1] : 0;
    const currentSignal = macd.signal.length
      ? macd.signal[macd.signal.length - 1]
      : 0;
    const prevHist = hist.length > 1 ? hist[hist.length - 2] : currentHist;

    // EMA Ribbon
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

    // ATR
    const atrArr = this._atr(candles, CONFIG.indicators.atrPeriod);
    const atr = atrArr.length ? atrArr[atrArr.length - 1] : 0.01;

    // POC
    const poc = this._poc(candles);

    // CVD
    const cvdArr = this._cvd(candles);
    const cvd = cvdArr.length ? cvdArr[cvdArr.length - 1] : 0;
    const cvdPrev = cvdArr.length > 1 ? cvdArr[cvdArr.length - 2] : cvd;

    // Bollinger
    const bb = this._bb(
      closes,
      CONFIG.indicators.bbPeriod,
      CONFIG.indicators.bbStdDev
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

    // Volume
    const vol = volumes[volumes.length - 1] || 0;
    const volAvg = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;

    const close = closes[closes.length - 1];
    const trendStrength = (close - e50) / (atr || 0.01);

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
      // Сохраняем все массивы для бэктеста (но не кэшируем)
      _rsi: rsi,
      _macd: macd,
      _ema8: ema8,
      _ema13: ema13,
      _ema21: ema21,
      _ema50: ema50,
      _atr: atrArr,
      _cvd: cvdArr,
      _bb: bb,
      _volumes: volumes,
      _closes: closes,
    };
  }

  // ---------- Приватные методы (чистые расчёты) ----------
  _rsi(data, period) {
    if (data.length < period + 1) return [50];
    const changes = [];
    for (let i = 1; i < data.length; i++) changes.push(data[i] - data[i - 1]);
    let avgGain = 0,
      avgLoss = 0;
    const len = Math.min(period, changes.length);
    for (let i = 0; i < len; i++) {
      if (changes[i] >= 0) avgGain += changes[i];
      else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period || 1;
    const rsi = [100 - 100 / (1 + avgGain / (avgLoss || 1))];
    for (let i = period; i < changes.length; i++) {
      const gain = changes[i] >= 0 ? changes[i] : 0;
      const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.push(100 - 100 / (1 + avgGain / (avgLoss || 1)));
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
      } else {
        ema.push(data[i] * k + ema[i - 1] * (1 - k));
      }
    }
    return ema;
  }

  _macd(data, fast, slow, signal) {
    if (data.length < slow) return { macd: [], signal: [], histogram: [] };
    const emaFast = this._ema(data, fast);
    const emaSlow = this._ema(data, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = this._ema(macdLine.slice(slow - fast), signal);
    const histogram = macdLine
      .slice(slow - fast)
      .map((v, i) => v - signalLine[i]);
    return { macd: macdLine.slice(slow - fast), signal: signalLine, histogram };
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
      } else {
        atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
      }
    }
    return atr;
  }

  _poc(candles) {
    if (!candles.length) return 0;
    const priceLevels = new Map();
    const minP = Math.min(...candles.map((c) => c.low));
    const maxP = Math.max(...candles.map((c) => c.high));
    const bucketSize = (maxP - minP) / 50 || 0.01;
    candles.forEach((c) => {
      const bucket = Math.floor(c.close / (bucketSize || 0.01));
      priceLevels.set(bucket, (priceLevels.get(bucket) || 0) + c.volume);
    });
    let maxVol = 0,
      pocBucket = 0;
    for (const [bucket, vol] of priceLevels) {
      if (vol > maxVol) {
        maxVol = vol;
        pocBucket = bucket;
      }
    }
    return pocBucket * (bucketSize || 0.01) + (bucketSize || 0.01) / 2;
  }

  _cvd(candles) {
    if (candles.length < 2) return [];
    const cvd = [];
    let cum = 0;
    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      const vol = candles[i].volume;
      const delta =
        change > 0
          ? vol * (change / candles[i - 1].close)
          : change < 0
          ? -vol * (Math.abs(change) / candles[i - 1].close)
          : 0;
      cum += delta;
      cvd.push(cum);
    }
    return cvd;
  }

  _bb(data, period, stdDev) {
    if (data.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [],
      middle = [],
      lower = [];
    for (let i = period - 1; i < data.length; i++) {
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      middle.push(mean);
      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
    return { upper, middle, lower };
  }
}

// ---------- Генератор сигналов (использует индикаторы) ----------
class SignalGenerator {
  constructor(indicatorCalc) {
    this.indicatorCalc = indicatorCalc;
  }

  generate(asset, tf, candles) {
    if (!candles || candles.length < CONFIG.minCandlesRequired) {
      return this._emptySignal(asset, tf);
    }
    const ind = this.indicatorCalc.calculateAll(candles, tf);
    if (!ind) return this._emptySignal(asset, tf);

    // Скоринг
    let buyScore = 0,
      sellScore = 0;
    const scores = {};

    // 1. RSI (extremes first: <10 / >90 never matched after <30 / >70)
    const rsi = ind.rsi;
    if (rsi < 10) {
      buyScore += 30;
      scores.rsi = 30;
    } else if (rsi > 90) {
      sellScore += 30;
      scores.rsi = -30;
    } else if (rsi < 20) {
      buyScore += 20;
      scores.rsi = 20;
    } else if (rsi > 80) {
      sellScore += 20;
      scores.rsi = -20;
    } else if (rsi < 30) {
      buyScore += 15;
      scores.rsi = 15;
    } else if (rsi > 70) {
      sellScore += 15;
      scores.rsi = -15;
    } else if (rsi < 40) {
      buyScore += 5;
      scores.rsi = 5;
    } else if (rsi > 60) {
      sellScore += 5;
      scores.rsi = -5;
    } else scores.rsi = 0;

    // 2. MACD
    const hist = ind.macdHist;
    if (hist > 0 && ind.macdLine > ind.macdSignal) {
      buyScore += 20;
      scores.macd = 20;
    } else if (hist < 0 && ind.macdLine < ind.macdSignal) {
      sellScore += 20;
      scores.macd = -20;
    } else if (hist > ind.macdPrevHist) {
      buyScore += 10;
      scores.macd = 10;
    } else if (hist < ind.macdPrevHist) {
      sellScore += 10;
      scores.macd = -10;
    } else scores.macd = 0;

    // 3. EMA Ribbon
    const c = ind.close;
    if (
      c > ind.ema8 &&
      ind.ema8 > ind.ema13 &&
      ind.ema13 > ind.ema21 &&
      ind.ema21 > ind.ema50
    ) {
      buyScore += 20;
      scores.ema = 20;
    } else if (
      c < ind.ema8 &&
      ind.ema8 < ind.ema13 &&
      ind.ema13 < ind.ema21 &&
      ind.ema21 < ind.ema50
    ) {
      sellScore += 20;
      scores.ema = -20;
    } else scores.ema = 0;

    // 4. CVD
    if (ind.cvd > ind.cvdPrev && ind.cvd > 0) {
      buyScore += 15;
      scores.cvd = 15;
    } else if (ind.cvd < ind.cvdPrev && ind.cvd < 0) {
      sellScore += 15;
      scores.cvd = -15;
    } else scores.cvd = 0;

    // 5. Bollinger
    if (c < ind.bbLower) {
      buyScore += 15;
      scores.bb = 15;
    } else if (c > ind.bbUpper) {
      sellScore += 15;
      scores.bb = -15;
    } else if (ind.bbWidth < 0.1 && c > ind.bbMiddle) {
      buyScore += 10;
      scores.bb = 10;
    } else if (ind.bbWidth < 0.1 && c < ind.bbMiddle) {
      sellScore += 10;
      scores.bb = -10;
    } else scores.bb = 0;

    // 6. Volume
    const volRatio = ind.volume / ind.volAvg;
    if (volRatio > 1.5 && c > ind.ema8) {
      buyScore += 10;
      scores.volume = 10;
    } else if (volRatio > 1.5 && c < ind.ema8) {
      sellScore += 10;
      scores.volume = -10;
    } else scores.volume = 0;

    // 7. POC
    const pocDist = Math.abs(c - ind.poc) / ind.atr;
    if (pocDist < 0.2 && c > ind.ema8) {
      buyScore += 5;
      scores.poc = 5;
    } else if (pocDist < 0.2 && c < ind.ema8) {
      sellScore += 5;
      scores.poc = -5;
    } else scores.poc = 0;

    const netScore = buyScore - sellScore;
    const confidence = utils.clamp(Math.abs(netScore), 0, 100);
    let direction = "NEUTRAL";
    if (netScore > 30 && ind.trendStrength > -1) direction = "BUY";
    else if (netScore < -30 && ind.trendStrength < 1) direction = "SELL";

    const actionProbs = this._calcActionProbs(
      buyScore,
      sellScore,
      ind.trendStrength,
      ind.bbWidth
    );

    return {
      asset,
      timeframe: tf,
      direction,
      confidence: Math.round(confidence),
      price: ind.close,
      timestamp: Date.now(),
      indicators: {
        rsi: Math.round(ind.rsi),
        macd: ind.macdHist.toFixed(4),
        ema8: ind.ema8.toFixed(2),
        ema50: ind.ema50.toFixed(2),
        atr: ind.atr.toFixed(2),
        bbWidth: (ind.bbWidth * 100).toFixed(1),
        trendStrength: ind.trendStrength.toFixed(2),
      },
      actionProbabilities: actionProbs,
      indicatorScores: scores,
      status: "Активен",
    };
  }

  _calcActionProbs(buyScore, sellScore, trendStrength, bbWidth) {
    let buyProb = Math.min((buyScore / 100) * 100, 100);
    let sellProb = Math.min((sellScore / 100) * 100, 100);
    if (bbWidth < 0.05) {
      buyProb *= 0.7;
      sellProb *= 0.7;
    }
    if (Math.abs(trendStrength) > 2) {
      if (trendStrength > 0) {
        buyProb = Math.min(buyProb * 1.3, 100);
        sellProb *= 0.7;
      } else {
        sellProb = Math.min(sellProb * 1.3, 100);
        buyProb *= 0.7;
      }
    }
    let waitProb = Math.max(100 - (buyProb + sellProb), 0);
    return {
      wait: Math.round(utils.clamp(waitProb, 0, 100)),
      buy: Math.round(utils.clamp(buyProb, 0, 100)),
      sell: Math.round(utils.clamp(sellProb, 0, 100)),
    };
  }

  _emptySignal(asset, tf) {
    const emptyScores = {
      rsi: 0,
      macd: 0,
      ema: 0,
      cvd: 0,
      bb: 0,
      volume: 0,
      poc: 0,
    };
    return {
      asset,
      timeframe: tf || "1h",
      direction: "NEUTRAL",
      confidence: 0,
      price: 0,
      timestamp: Date.now(),
      indicators: {
        rsi: 0,
        macd: "0",
        ema8: "0",
        ema50: "0",
        atr: "0",
        bbWidth: "0",
        trendStrength: "0",
      },
      actionProbabilities: { wait: 100, buy: 0, sell: 0 },
      indicatorScores: emptyScores,
      status: "⏳ Загрузка...",
    };
  }
}

// ---------- Бэктестер (использует тот же генератор сигналов) ----------
class Backtester {
  constructor(signalGenerator) {
    this.signalGen = signalGenerator;
    this.tradeHistory = [];
    this.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      winRate: 0,
    };
  }

  async run(asset, candles, tf) {
    if (!candles || candles.length < 100) return [];
    const agg = this._aggregate(candles, tf);
    if (agg.length < 100) return [];

    const trades = [];
    let position = null,
      entryPrice = 0,
      entryTime = 0,
      direction = "";
    const config = CONFIG.trading;

    for (let i = 100; i < agg.length; i++) {
      const windowCandles = agg.slice(0, i + 1);
      const current = agg[i];
      const price = current.close;
      const signal = this.signalGen.generate(asset, tf, windowCandles);

      if (position) {
        const profitPercent = ((price - entryPrice) / entryPrice) * 100;
        const currentProfit =
          direction === "BUY" ? profitPercent : -profitPercent;
        const isOpposite =
          signal &&
          signal.confidence >= config.minConfidence &&
          ((direction === "BUY" && signal.direction === "SELL") ||
            (direction === "SELL" && signal.direction === "BUY"));

        if (currentProfit >= config.minProfitPercent) {
          trades.push(
            this._closePosition(position, price, current.time, "take_profit")
          );
          position = null;
        } else if (currentProfit <= -config.maxLossPercent) {
          trades.push(
            this._closePosition(position, price, current.time, "stop_loss")
          );
          position = null;
        } else if (i - (position.entryIndex ?? i) > 50) {
          trades.push(
            this._closePosition(position, price, current.time, "timeout")
          );
          position = null;
        } else if (isOpposite) {
          trades.push(
            this._closePosition(position, price, current.time, "reverse_signal")
          );
          position = null;
        }
      }

      if (
        !position &&
        signal &&
        (signal.direction === "BUY" || signal.direction === "SELL") &&
        signal.confidence >= config.minConfidence
      ) {
        position = {
          asset,
          direction: signal.direction,
          entryPrice: price,
          entryTime: current.time,
          entryConfidence: signal.confidence,
          entryIndex: i,
        };
        entryPrice = price;
        entryTime = current.time;
        direction = signal.direction;
      }
    }

    // Закрыть оставшиеся позиции
    if (position) {
      const last = agg[agg.length - 1];
      trades.push(
        this._closePosition(position, last.close, last.time, "timeout")
      );
    }

    this.tradeHistory = trades.sort((a, b) => b.exitTime - a.exitTime);
    this._updateStats();
    return this.tradeHistory;
  }

  computeStats(trades) {
    const list = trades || [];
    const total = list.length;
    if (total === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        winRate: 0,
      };
    }
    const wins = list.filter((t) => t.profit > 0).length;
    const losses = list.filter((t) => t.profit < 0).length;
    const totalProfit = list.reduce((s, t) => s + t.profit, 0);
    return {
      totalTrades: total,
      wins,
      losses,
      totalProfit,
      winRate: (wins / total) * 100,
    };
  }

  _closePosition(pos, exitPrice, exitTime, reason) {
    const profitPercent = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100;
    const profit = pos.direction === "BUY" ? profitPercent : -profitPercent;
    return {
      asset: pos.asset || "UNKNOWN",
      direction: pos.direction,
      entryPrice: pos.entryPrice,
      exitPrice: exitPrice,
      entryTime: pos.entryTime,
      exitTime: exitTime,
      profitPercent: profit,
      profit: (profit / 100) * CONFIG.trading.positionSize,
      confidence: pos.entryConfidence,
      exitReason: reason,
    };
  }

  _updateStats() {
    this.stats = this.computeStats(this.tradeHistory);
  }

  _aggregate(candles, tf) {
    const tfMap = { "15m": 15, "1h": 60, "2h": 120, "4h": 240, "1d": 1440 };
    const minutes = tfMap[tf] || 60;
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
  }
}

// ---------- WebSocket менеджер ----------
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
        `wss://stream.binance.com:9443/stream?streams=${streams}`
      );
      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log("🔌 WebSocket подключен");
        if (this.onStatus) this.onStatus(true);
      };
      this.ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          const payload = parsed.data || parsed;
          if (payload && payload.k) {
            this.onKline(payload);
          }
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
        console.log("🔌 WebSocket закрыт, переподключение...");
        this._reconnect();
      };
      this.ws.onerror = () => {
        console.warn("⚠️ WebSocket ошибка");
      };
    } catch (e) {
      console.warn("⚠️ Ошибка создания WebSocket", e);
      this._reconnect();
    }
  }

  _reconnect() {
    if (this._stopped || this.reconnectAttempts >= this.maxAttempts) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * this.reconnectAttempts, 30000);
    setTimeout(() => {
      if (!this.connected && !this._stopped) this.connect();
    }, delay);
  }

  close() {
    this._stopped = true;
    if (this.ws) this.ws.close();
  }
}

// ---------- Рендерер UI (оптимизированное обновление) ----------
class UIRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error("Контейнер не найден");
    this.cards = {}; // ссылки на элементы карточек
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
  }

  setSoundManager(sm) {
    this.soundManager = sm;
  }

  render() {
    const html = this._buildHTML();
    this.container.innerHTML = html;
    this._cacheElements();
    this._bindEvents();
    return this;
  }

  _buildHTML() {
    const assetCards = CONFIG.assets
      .map(
        (asset) => `
            <div class="signal-card neutral" data-asset="${asset}">
                <div class="signal-strength-badge"></div>
                <div class="card-header">
                    <span class="asset-name">${this._displayName(asset)}</span>
                    <span class="asset-price">--</span>
                </div>
                <div class="card-body">
                    <span class="signal-direction">⏳ Ожидание</span>
                    <span class="signal-confidence">--%</span>
                </div>
                <div class="indicators-grid">
                    ${["rsi", "macd", "ema", "cvd", "bb", "volume", "poc"]
                      .map(
                        (ind) => `
                        <div class="indicator-item" data-indicator="${ind}">
                            <span class="ind-label">${this._indLabel(
                              ind
                            )}</span>
                            <div class="indicator-bar-wrap">
                                <div class="indicator-bar-fill neutral" style="width:0%"></div>
                            </div>
                            <span class="ind-value neutral">--</span>
                        </div>
                    `
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
                        <span class="label">📈 Купить</span>
                        <span class="value">0%</span>
                        <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                    </div>
                    <div class="action-indicator sell" data-action="sell">
                        <span class="label">📉 Продать</span>
                        <span class="value">0%</span>
                        <div class="bar-bg"><div class="bar-fill" style="width:0%"></div></div>
                    </div>
                </div>
                <div class="card-footer">
                    <span class="tf-signal">--</span>
                </div>
            </div>
        `
      )
      .join("");

    return `
            <div class="crypto-signal-widget">
                <div class="widget-header">
                    <div>
                        <span class="widget-title">🧠 Crypto Signal Engine</span>
                        <span class="widget-version">v9.1 • 7 индикаторов • Звук при ≥75%</span>
                    </div>
                    <div class="widget-status-group">
                        <div class="sound-controls">
                            <button class="sound-toggle active" id="sound-toggle">
                                🔊 <span class="sound-label">Вкл</span>
                            </button>
                            <span class="sound-status" id="sound-status">
                                <span class="sound-indicator on"></span> 
                            </span>
                        </div>
                        <span class="ws-status" id="ws-status">⚡ Подключение...</span>
                        <span class="last-update" id="last-update">--:--:--</span>
                    </div>
                </div>

                <div class="tf-group" id="tf-group">
                    ${CONFIG.timeframes
                      .map(
                        (tf) =>
                          `<button class="tf-btn ${
                            tf === CONFIG.defaultTF ? "active" : ""
                          }" data-tf="${tf}">${tf}</button>`
                      )
                      .join("")}
                </div>

                <div class="signal-grid" id="signal-grid">
                    ${assetCards}
                </div>

                <div class="trade-history-section">
                    <div class="trade-history-header">
                        <div class="trade-history-title">📊 История торговли (backtesting) стратегии на исторических данных. Виджет симулирует торговлю, используя те же самые 7 индикаторов, и показывает, как бы вы заработали или потеряли деньги, если бы следовали сигналам в прошлом.</div>
                        <div class="trade-history-stats" id="trade-stats">
                            <div class="stat-item">Всего: <span class="stat-value total" id="stat-total">0</span></div>
                            <div class="stat-item">✅ Win: <span class="stat-value win" id="stat-wins">0</span></div>
                            <div class="stat-item">❌ Loss: <span class="stat-value loss" id="stat-losses">0</span></div>
                            <div class="stat-item">📈 Win Rate: <span class="stat-value" id="stat-winrate" style="color:#fbbf24;">0%</span></div>
                            <div class="stat-item">💰 P/L: <span class="stat-value" id="stat-pl" style="color:#94a3b8;">$0</span></div>
                        </div>
                    </div>
                    <div class="trade-history-grid" id="trade-history-grid">
                        <div style="grid-column:1/-1; text-align:center; color:#475569; font-size:12px; padding:20px;">⏳ Загрузка исторических данных...</div>
                    </div>
                </div>

                <div class="widget-footer">
                    <div class="footer-stat">⚡ <span id="signal-count">0</span> сигналов</div>
                    <div class="footer-stat">🎯 >75% Сильный</div>
                    <div class="footer-stat">💾 <span id="cache-status">Кэш</span></div>
                    <div class="footer-stat">🔗 <span id="connection-info">WebSocket</span></div>
                    <div class="footer-stat">📈 <span id="history-status">История</span></div>
                    <div class="footer-stat">🪙 <span id="asset-count">${
                      CONFIG.assets.length
                    } активов</span></div>
                    <div class="footer-stat">🔊 <span id="sound-status-footer">Звук: Вкл</span></div>
                </div>

                <!-- Свёрнутая документация -->
                <div class="docs-wrapper">
                    <details>
                        <summary>Документация</summary>
                        <div class="docs-content">
                            ${this._buildDocs()}
                        </div>
                    </details>
                </div>
            </div>
        `;
  }

  _buildDocs() {
    return `
            <div class="doc-grid">
                ${CONFIG.timeframes
                  .map((tf) => {
                    const guide = {
                      "15m": {
                        name: "15 Минут",
                        icon: "⚡",
                        action: {
                          BUY: "Скальпинг. Цель: +0.5-1.5%. Стоп: -0.5-1%.",
                          SELL: "Краткосрочный выход. Цель: +0.5-1.5%. Стоп: -0.5-1%.",
                          WAIT: "Рынок неопределён. Ждите 1H+.",
                        },
                        risk: "Высокий",
                        positionSize: "1-2%",
                        stopLoss: "0.5-1%",
                        takeProfit: "0.5-1.5%",
                      },
                      "1h": {
                        name: "1 Час",
                        icon: "📊",
                        action: {
                          BUY: "Стандартный вход. Цель: +1-3%. Стоп: -1-1.5%.",
                          SELL: "Стандартный выход. Цель: +1-3%. Стоп: -1-1.5%.",
                          WAIT: "Сигнал слабый. Ждите 2H+.",
                        },
                        risk: "Средний",
                        positionSize: "3-5%",
                        stopLoss: "1-1.5%",
                        takeProfit: "1-3%",
                      },
                      "2h": {
                        name: "2 Часа",
                        icon: "📈",
                        action: {
                          BUY: "Свинг-трейдинг. Цель: +2-4%. Стоп: -1.5-2%.",
                          SELL: "Свинг-выход. Цель: +2-4%. Стоп: -1.5-2%.",
                          WAIT: "Тренд не сформирован. Ждите 4H+.",
                        },
                        risk: "Средний-Высокий",
                        positionSize: "3-5%",
                        stopLoss: "1.5-2%",
                        takeProfit: "2-4%",
                      },
                      "4h": {
                        name: "4 Часа",
                        icon: "📉",
                        action: {
                          BUY: "Среднесрочный вход. Цель: +3-6%. Стоп: -2-3%.",
                          SELL: "Среднесрочный выход. Цель: +3-6%. Стоп: -2-3%.",
                          WAIT: "Нет чёткого тренда. Ждите 1D+.",
                        },
                        risk: "Средний",
                        positionSize: "5-10%",
                        stopLoss: "2-3%",
                        takeProfit: "3-6%",
                      },
                      "1d": {
                        name: "1 День",
                        icon: "🏛️",
                        action: {
                          BUY: "Долгосрочный вход. Цель: +5-15%. Стоп: -3-5%.",
                          SELL: "Долгосрочный выход. Цель: +5-15%. Стоп: -3-5%.",
                          WAIT: "Глобальный тренд не определён.",
                        },
                        risk: "Низкий-Средний",
                        positionSize: "10-20%",
                        stopLoss: "3-5%",
                        takeProfit: "5-15%",
                      },
                    }[tf];
                    if (!guide) return "";
                    return `
                        <div class="doc-card" data-tf="${tf}">
                            <div class="tf-name">${guide.icon} ${guide.name}</div>
                            <div style="margin:4px 0; font-size:11px;">
                                <span class="action-buy">📈 BUY:</span> ${guide.action.BUY}
                            </div>
                            <div style="margin:4px 0; font-size:11px;">
                                <span class="action-sell">📉 SELL:</span> ${guide.action.SELL}
                            </div>
                            <div style="margin:4px 0; font-size:11px;">
                                <span class="action-wait">⏸️ WAIT:</span> ${guide.action.WAIT}
                            </div>
                            <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
                                <div><span class="risk-label">Риск:</span> <span class="risk-value">${guide.risk}</span></div>
                                <div><span class="risk-label">Размер:</span> <span class="risk-value">${guide.positionSize}</span></div>
                                <div><span class="risk-label">Стоп:</span> <span class="risk-value" style="color:#f87171;">${guide.stopLoss}</span></div>
                                <div><span class="risk-label">Профит:</span> <span class="risk-value" style="color:#34d399;">${guide.takeProfit}</span></div>
                            </div>
                        </div>
                    `;
                  })
                  .join("")}
            </div>
            <div class="doc-legend">
                <span class="legend-item"><span class="legend-dot buy-dot"></span> BUY</span>
                <span class="legend-item"><span class="legend-dot sell-dot"></span> SELL</span>
                <span class="legend-item"><span class="legend-dot wait-dot"></span> WAIT</span>
                <span class="legend-item"><span class="legend-dot strong-dot"></span> Strong (>75%)</span>
                <span class="legend-item" style="color:#fbbf24;">🔊 Звук при ≥75%</span>
                <span class="legend-item">⚠️ Риск-менеджмент обязателен! ⚠️</span>
            </div>
            <div style="margin-top:8px; padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:11px; color:#94a3b8;">
                <strong style="color:#e2e8f0;">📌 Общие правила:</strong><br>
                • Используйте 4H как основной таймфрейм для входа<br>
                • 1H и 2H — для уточнения точек входа<br>
                • 15m — только для скальпинга (опытные трейдеры)<br>
                • 1D — для долгосрочных инвестиций<br>
                • Всегда используйте стоп-лосс!<br>
                • Не рискуйте более 2-3% депозита на одну сделку<br>
                • Диверсифицируйте активы (не более 30% в один актив)
            </div>
            <br>
            <span>Данное приложение — это мощный инструмент для принятия торговых решений, но не гарантия прибыли. Это профессиональный торговый терминал для криптовалют, который объединяет 7 лучших технических индикаторов в единую систему генерации сигналов. Приложение работает в реальном времени, анализируя данные с 7 криптобирж (Binance, Bybit, OKX, MEXC, Coinbase, HTX, KuCoin)</span>
            <br><br>
            <span>🧠 РАСШИФРОВКА 7 ИНДИКАТОРОВ
              <br>
              1. RSI (Индекс относительной силы) — Вес 15%
              Значение	Сигнал	Баллы
              RSI < 30	Перепроданность → BUY	+15
              RSI < 40	Легкая перепроданность → BUY	+5
              RSI > 70	Перекупленность → SELL	-15
              RSI > 60	Легкая перекупленность → SELL	-5
              40-60	Нейтрально	0
              <br>
              2. MACD (12, 26, 9) — Вес 20%
              Ситуация	Сигнал	Баллы
              Hist > 0 И MACD > Signal	Бычий момент → BUY	+20
              Hist < 0 И MACD < Signal	Медвежий момент → SELL	-20
              Hist растет	Усиление бычьего момента → BUY	+10
              Hist падает	Усиление медвежьего момента → SELL	-10
              <br>
              3. EMA Ribbon (8, 13, 21, 50) — Вес 20%
              Ситуация	Сигнал	Баллы
              Цена > EMA8 > EMA13 > EMA21 > EMA50	Сильный бычий тренд → BUY	+20
              Цена < EMA8 < EMA13 < EMA21 < EMA50	Сильный медвежий тренд → SELL	-20
              <br>
              4. CVD (Кумулятивный объемный дельта) — Вес 15%
              Ситуация	Сигнал	Баллы
              CVD растет и > 0	Покупатели доминируют → BUY	+15
              CVD падает и < 0	Продавцы доминируют → SELL	-15
              <br>
              5. Bollinger Bands (20, 2) — Вес 15%
              Ситуация	Сигнал	Баллы
              Цена < Нижняя полоса	Экстремальная перепроданность → BUY	+15
              Цена > Верхняя полоса	Экстремальная перекупленность → SELL	-15
              Сужение полос + цена выше среднего	Ожидание пробоя вверх → BUY	+10
              Сужение полос + цена ниже среднего	Ожидание пробоя вниз → SELL	-10
              <br>
              6. Volume Spike (Аномальный объем) — Вес 10%
              Ситуация	Сигнал	Баллы
              Объем > 1.5x среднего И цена > EMA8	Подтверждение бычьего движения → BUY	+10
              Объем > 1.5x среднего И цена < EMA8	Подтверждение медвежьего движения → SELL	-10
              <br>
              7. POC (Point of Control) — Вес 5%
              Ситуация	Сигнал	Баллы
              Цена у POC И цена > EMA8	Уровень поддержки → BUY	+5
              Цена у POC И цена < EMA8	Уровень сопротивления → SELL	-5
          </span>
          <br>
          <span>
              <strong>МЕРЦАНИЕ</strong>
              <br>
              Мерцающая обводка (визуализация):
              <br>
              Уровень	Цвет	Скорость мерцания	Действие
              <br>
              60-64%	🟢/🔴 Слабая	2 секунды	Обратить внимание
              <br>
              65-69%	🟢/🔴 Средняя	1.5 секунды	Рассмотреть вход
              <br>
              70-74%	🟢/🔴 Сильная	1.2 секунды	Хороший сигнал
              <br>
              75-79%	🟢/🔴 Очень сильная	0.9 секунды	Отличный сигнал
              <br>
              80%+	🟢/🔴 Экстремальная	0.6 секунды	🔥 СРОЧНЫЙ ВХОД!
          </span></span>
        `;
  }

  _displayName(asset) {
    const map = {
      BTC: "₿ BTC",
      ETH: "⟠ ETH",
      BNB: "🟡 BNB",
      SOL: "◎ SOL",
      XRP: "✕ XRP",
      ADA: "₳ ADA",
      GRAM: "📱 GRAM",
      TRX: "🔺 TRX",
      PAXG: "🥇 PAXG",
    };
    return map[asset] || asset;
  }

  _indLabel(ind) {
    const map = {
      rsi: "RSI",
      macd: "MACD",
      ema: "EMA Ribbon",
      cvd: "CVD",
      bb: "Bollinger",
      volume: "Volume",
      poc: "POC",
    };
    return map[ind] || ind;
  }

  _cacheElements() {
    this.el = {
      grid: document.getElementById("signal-grid"),
      status: document.getElementById("ws-status"),
      lastUpdate: document.getElementById("last-update"),
      signalCount: document.getElementById("signal-count"),
      cacheStatus: document.getElementById("cache-status"),
      connectionInfo: document.getElementById("connection-info"),
      historyGrid: document.getElementById("trade-history-grid"),
      historyStatus: document.getElementById("history-status"),
      assetCount: document.getElementById("asset-count"),
      soundStatusFooter: document.getElementById("sound-status-footer"),
      soundToggle: document.getElementById("sound-toggle"),
      tfGroup: document.getElementById("tf-group"),
      statTotal: document.getElementById("stat-total"),
      statWins: document.getElementById("stat-wins"),
      statLosses: document.getElementById("stat-losses"),
      statWinrate: document.getElementById("stat-winrate"),
      statPl: document.getElementById("stat-pl"),
    };
    // Сохраняем карточки
    this.cards = {};
    document.querySelectorAll(".signal-card").forEach((card) => {
      const asset = card.dataset.asset;
      this.cards[asset] = card;
    });
  }

  _bindEvents() {
    // Звук
    if (this.el.soundToggle) {
      this.el.soundToggle.addEventListener("click", () => {
        if (this.soundManager) {
          const enabled = this.soundManager.toggle();
          this.el.soundToggle.className = `sound-toggle ${
            enabled ? "active" : "muted"
          }`;
          this.el.soundToggle.innerHTML = `${
            enabled ? "🔊" : "🔇"
          }<span class="sound-label">${enabled ? "Вкл" : "Выкл"}</span>`;
          this.el.soundStatusFooter.textContent = `Звук: ${
            enabled ? "Вкл" : "Выкл"
          }`;
        }
      });
    }
    // Таймфреймы
    if (this.el.tfGroup) {
      this.el.tfGroup.addEventListener("click", (e) => {
        const btn = e.target.closest(".tf-btn");
        if (!btn) return;
        this.el.tfGroup
          .querySelectorAll(".tf-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentTF = btn.dataset.tf;
        if (this.onTFChange) this.onTFChange(this.currentTF);
      });
    }
  }

  // Обновление сигнала для одного актива
  updateSignal(asset, signal) {
    this.signals.set(asset, signal);
    const card = this.cards[asset];
    if (!card) return;

    // Обновляем цену
    const priceEl = card.querySelector(".asset-price");
    if (priceEl && signal.price)
      priceEl.textContent = `$${signal.price.toFixed(2)}`;

    // Направление и уверенность
    const dirEl = card.querySelector(".signal-direction");
    const confEl = card.querySelector(".signal-confidence");
    if (dirEl) {
      let icon = "⏸️",
        color = "#94a3b8",
        bg = "rgba(255,255,255,0.05)";
      if (signal.direction === "BUY") {
        icon = "📈";
        color = "#34d399";
        bg = "rgba(52,211,153,0.15)";
      } else if (signal.direction === "SELL") {
        icon = "📉";
        color = "#f87171";
        bg = "rgba(248,113,113,0.15)";
      }
      dirEl.textContent = `${icon} ${signal.direction}`;
      dirEl.style.background = bg;
      dirEl.style.color = color;
    }
    if (confEl) {
      const conf = signal.confidence || 0;
      confEl.textContent = conf > 0 ? `${conf}%` : "--%";
      confEl.style.color =
        conf >= 75
          ? "#34d399"
          : conf >= 60
          ? "#fbbf24"
          : conf >= 45
          ? "#f59e0b"
          : "#475569";
    }

    // Индикаторы (7 штук)
    this._updateIndicators(card, signal.indicatorScores);

    // Action probabilities
    this._updateActions(card, signal.actionProbabilities);

    // Бейдж и мерцание
    this._updateBadgeAndGlow(card, signal.direction, signal.confidence);

    // Футер
    const tfEl = card.querySelector(".tf-signal");
    if (tfEl && signal.indicators) {
      tfEl.textContent = `RSI:${signal.indicators.rsi} | MACD:${signal.indicators.macd}`;
    }

    // Звук
    if (
      this.soundManager &&
      signal.confidence >= CONFIG.sound.threshold &&
      signal.direction !== "NEUTRAL"
    ) {
      const signalType = signal.direction;
      const currentKey = `${asset}-${signalType}-${signal.confidence}`;
      const prevKey = this._lastSignalKey?.[asset];
      if (prevKey !== currentKey) {
        this.soundManager.stopRepeating(asset);
        this.soundManager.startRepeating(asset, signalType, signal.confidence);
        this._lastSignalKey = this._lastSignalKey || {};
        this._lastSignalKey[asset] = currentKey;
      }
    } else if (this.soundManager) {
      this.soundManager.stopRepeating(asset);
      if (this._lastSignalKey) delete this._lastSignalKey[asset];
    }
  }

  _updateIndicators(card, scores) {
    if (!scores) return;
    const items = card.querySelectorAll(".indicator-item");
    const keys = ["rsi", "macd", "ema", "cvd", "bb", "volume", "poc"];
    items.forEach((item, idx) => {
      const key = keys[idx];
      const score = scores[key] || 0;
      const valueEl = item.querySelector(".ind-value");
      const barFill = item.querySelector(".indicator-bar-fill");
      if (!valueEl || !barFill) return;
      let direction = "neutral",
        display = "0%";
      if (score > 0) {
        const pct = Math.min((score / 20) * 100, 100);
        display = `+${Math.round(pct)}%`;
        direction = score >= 15 ? "strong-bullish" : "bullish";
      } else if (score < 0) {
        const pct = Math.min((Math.abs(score) / 20) * 100, 100);
        display = `-${Math.round(pct)}%`;
        direction = Math.abs(score) >= 15 ? "strong-bearish" : "bearish";
      }
      valueEl.textContent = display;
      valueEl.className = `ind-value ${direction}`;
      const barPercent = Math.min((Math.abs(score) / 20) * 100, 100);
      barFill.style.width = `${barPercent}%`;
      barFill.className = `indicator-bar-fill ${
        direction.includes("bullish")
          ? "bullish"
          : direction.includes("bearish")
          ? "bearish"
          : "neutral"
      }`;
    });
  }

  _updateActions(card, probs) {
    if (!probs) return;
    const actions = card.querySelectorAll(".action-indicator");
    actions.forEach((el) => {
      const action = el.dataset.action;
      const valueEl = el.querySelector(".value");
      const barFill = el.querySelector(".bar-fill");
      if (!valueEl || !barFill) return;
      const pct = probs[action] || 0;
      valueEl.textContent = `${pct}%`;
      barFill.style.width = `${pct}%`;
      el.classList.toggle("active", pct > 30);
    });
  }

  _updateBadgeAndGlow(card, direction, confidence) {
    const badge = card.querySelector(".signal-strength-badge");
    // Сброс классов
    card.className = card.className
      .split(" ")
      .filter(
        (cls) =>
          !cls.startsWith("buy-") &&
          !cls.startsWith("sell-") &&
          cls !== "neutral"
      )
      .join(" ");
    if (badge) {
      badge.className = "signal-strength-badge";
      badge.textContent = "";
    }
    if (direction === "NEUTRAL" || confidence < 60) {
      card.classList.add("neutral");
      return;
    }
    let signalClass = "",
      badgeText = "",
      badgeClass = "";
    const isBuy = direction === "BUY";
    if (confidence >= 80) {
      signalClass = isBuy ? "buy-80" : "sell-80";
      badgeText = isBuy ? "🔥 СИЛЬНЫЙ BUY" : "🔥 СИЛЬНЫЙ SELL";
      badgeClass = isBuy ? "buy-strong" : "sell-strong";
    } else if (confidence >= 75) {
      signalClass = isBuy ? "buy-75" : "sell-75";
      badgeText = isBuy ? "💪 BUY 75%+" : "💪 SELL 75%+";
      badgeClass = isBuy ? "buy-strong" : "sell-strong";
    } else if (confidence >= 70) {
      signalClass = isBuy ? "buy-70" : "sell-70";
      badgeText = isBuy ? "📈 BUY 70%+" : "📉 SELL 70%+";
      badgeClass = isBuy ? "buy" : "sell";
    } else if (confidence >= 65) {
      signalClass = isBuy ? "buy-65" : "sell-65";
      badgeText = isBuy ? "📈 BUY 65%+" : "📉 SELL 65%+";
      badgeClass = isBuy ? "buy" : "sell";
    } else {
      signalClass = isBuy ? "buy-60" : "sell-60";
      badgeText = isBuy ? "📈 BUY 60%+" : "📉 SELL 60%+";
      badgeClass = isBuy ? "buy" : "sell";
    }
    card.classList.add(signalClass);
    if (badge) {
      badge.textContent = badgeText;
      badge.className = `signal-strength-badge visible ${badgeClass}`;
    }
  }

  updateTradeHistory(history, stats) {
    this.tradeHistory = history || [];
    this.stats = stats || {
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
    const grid = this.el.historyGrid;
    if (!grid) return;
    const trades = this.tradeHistory;
    if (!trades.length) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#475569; font-size:12px; padding:20px;">📭 Нет сделок</div>`;
      return;
    }
    const display = trades.slice(0, 20);
    grid.innerHTML = display
      .map((t) => {
        const isWin = t.profit > 0;
        const profitStr =
          (t.profit >= 0 ? "+" : "") + t.profit.toFixed(2) + "$";
        const dirLabel = t.direction === "BUY" ? "📈 BUY" : "📉 SELL";
        const badgeCls = t.direction === "BUY" ? "buy-badge" : "sell-badge";
        const date = new Date(t.entryTime).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        const assetName = this._displayName(t.asset) || t.asset;
        return `
                <div class="trade-card">
                    <div class="trade-info">
                        <div class="trade-asset">${assetName}</div>
                        <div class="trade-detail">
                            <span class="trade-direction-badge ${badgeCls}">${dirLabel}</span>
                            <span style="color:#475569; margin-left:6px;">conf: ${
                              t.confidence
                            }%</span>
                        </div>
                        <div class="trade-detail">Entry: $${t.entryPrice.toFixed(
                          2
                        )} → Exit: $${t.exitPrice.toFixed(2)}</div>
                        <div class="trade-time">${date}</div>
                    </div>
                    <div class="trade-result">
                        <div class="trade-profit ${
                          isWin ? "positive" : "negative"
                        }">${profitStr}</div>
                        <div style="font-size:10px; color:#64748b;">${
                          (t.profitPercent >= 0 ? "+" : "") +
                          t.profitPercent.toFixed(2)
                        }%</div>
                        <div style="font-size:8px; color:#475569; margin-top:2px;">${
                          t.exitReason === "take_profit"
                            ? "✅ TP"
                            : t.exitReason === "stop_loss"
                            ? "🛑 SL"
                            : t.exitReason === "reverse_signal"
                            ? "🔄 REV"
                            : "⏱️ TO"
                        }</div>
                    </div>
                </div>
            `;
      })
      .join("");
    if (trades.length > 20) {
      grid.innerHTML += `<div style="grid-column:1/-1; text-align:center; color:#475569; font-size:11px; padding:8px;">+ ${
        trades.length - 20
      } more...</div>`;
    }
  }

  _updateStatsUI() {
    const s = this.stats;
    if (this.el.statTotal) this.el.statTotal.textContent = s.totalTrades;
    if (this.el.statWins) this.el.statWins.textContent = s.wins;
    if (this.el.statLosses) this.el.statLosses.textContent = s.losses;
    if (this.el.statWinrate) {
      const wr = s.totalTrades ? s.winRate.toFixed(1) + "%" : "0%";
      this.el.statWinrate.textContent = wr;
      this.el.statWinrate.style.color =
        s.winRate > 50 ? "#34d399" : s.winRate > 30 ? "#fbbf24" : "#f87171";
    }
    if (this.el.statPl) {
      const pl = s.totalProfit;
      this.el.statPl.textContent = (pl >= 0 ? "+" : "") + pl.toFixed(2) + "$";
      this.el.statPl.style.color =
        pl > 0 ? "#34d399" : pl < 0 ? "#f87171" : "#94a3b8";
    }
  }

  setConnectionStatus(connected) {
    const status = this.el.status;
    if (status) {
      status.textContent = connected ? "🟢 Live" : "🔴 Переподключение...";
      status.style.color = connected ? "#34d399" : "#f87171";
    }
    if (this.el.connectionInfo) {
      this.el.connectionInfo.textContent = connected
        ? "🟢 Подключен"
        : "🔴 Отключен";
      this.el.connectionInfo.style.color = connected ? "#34d399" : "#f87171";
    }
  }

  setLastUpdate(time) {
    if (this.el.lastUpdate) this.el.lastUpdate.textContent = time;
  }

  setSignalCount(count) {
    if (this.el.signalCount) this.el.signalCount.textContent = count;
  }

  setCacheStatus(text) {
    if (this.el.cacheStatus) this.el.cacheStatus.textContent = text;
  }

  setHistoryStatus(text) {
    if (this.el.historyStatus) this.el.historyStatus.textContent = text;
  }

  onTFChange = null;
}

// ---------- Главный класс приложения ----------
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

    this.marketData = new Map(); // asset -> candles
    this.signals = new Map();
    this.currentTF = CONFIG.defaultTF;
    this.wsManager = null;
    this._updateInterval = null;
    this._historyLoaded = false;
    this._signalThrottle = null;
    this._loadingAssets = new Set();
    this._loadedTF = null;
  }

  async init() {
    this.ui.render();
    this._bindUIEvents();

    // Подключаем WebSocket
    this.wsManager = new WSManager((data) => this._handleKline(data));
    this.wsManager.onStatus = (connected) =>
      this.ui.setConnectionStatus(connected);
    this.wsManager.connect();

    // Загружаем историю
    await this._loadHistoricalData();

    // Генерируем первые сигналы
    this._generateSignals();

    // Периодическое обновление сигналов (каждые 2 минуты)
    this._updateInterval = setInterval(() => this._generateSignals(), 120000);

    // Обновление статуса
    setInterval(() => {
      this.ui.setLastUpdate(new Date().toLocaleTimeString());
    }, 30000);

    console.log("✅ Приложение инициализировано");
    window.__app = this;
  }

  _bindUIEvents() {}

  async _loadHistoricalData() {
    const tf = this.currentTF;
    if (this._historyLoaded && this._loadedTF === tf) return;
    this.ui.setHistoryStatus("⏳ Загрузка...");
    let loaded = 0;
    for (const asset of CONFIG.assets) {
      const symbol = CONFIG.symbolMap[asset];
      const candles = await this.dataLoader.fetchCandles(
        symbol,
        tf,
        CONFIG.historyCandles
      );
      if (candles && candles.length) {
        this.marketData.set(asset, candles);
        loaded++;
      } else {
        console.warn(`⚠️ Нет данных для ${asset}`);
      }
    }
    this.ui.setCacheStatus(`📊 ${loaded}/${CONFIG.assets.length} активов`);
    this._historyLoaded = loaded > 0;
    this._loadedTF = tf;
    if (loaded === 0) {
      this.ui.setHistoryStatus("⚠️ Нет данных");
      return;
    }

    setTimeout(() => this._runBacktest(), 500);
  }

  async _runBacktest() {
    const allTrades = [];
    for (const asset of CONFIG.assets) {
      const candles = this.marketData.get(asset);
      if (!candles || candles.length < 100) continue;
      const trades = await this.backtester.run(asset, candles, this.currentTF);
      allTrades.push(...trades);
    }
    allTrades.sort((a, b) => b.exitTime - a.exitTime);
    this.ui.updateTradeHistory(
      allTrades,
      this.backtester.computeStats(allTrades)
    );
    this.ui.setHistoryStatus(`✅ ${allTrades.length} сделок`);
  }

  _tfToMs(tf) {
    const map = {
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "2h": 2 * 60 * 60 * 1000,
      "4h": 4 * 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    };
    return map[tf] || map["1h"];
  }

  _handleKline(data) {
    const k = data.k;
    const symbol = data.s;
    const asset = Object.keys(CONFIG.symbolMap).find(
      (a) => CONFIG.symbolMap[a] === symbol
    );
    if (!asset || !CONFIG.assets.includes(asset)) return;
    if (!this.marketData.has(asset)) this.marketData.set(asset, []);
    const candles = this.marketData.get(asset);
    const openTime = Number(k.t);
    const tfMs = this._tfToMs(this.currentTF);
    const bucket = Math.floor(openTime / tfMs) * tfMs;
    const last = candles[candles.length - 1];
    const lastBucket = last ? Math.floor(last.time / tfMs) * tfMs : null;

    if (last && lastBucket === bucket) {
      last.high = Math.max(last.high, +k.h);
      last.low = Math.min(last.low, +k.l);
      last.close = +k.c;
    } else if (!last || bucket > lastBucket) {
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
    let activeCount = 0;
    for (const asset of CONFIG.assets) {
      const candles = this.marketData.get(asset);
      if (!candles || candles.length < CONFIG.minCandlesRequired) {
        if (!this._loadingAssets.has(asset)) {
          this._loadAssetData(asset);
        }
        continue;
      }
      const agg = this._aggregateCandles(candles, tf);
      if (!agg || agg.length < CONFIG.minCandlesRequired) continue;
      const signal = this.signalGen.generate(asset, tf, agg);
      if (signal) {
        this.signals.set(asset, signal);
        this.ui.updateSignal(asset, signal);
        if (signal.direction !== "NEUTRAL" && signal.confidence >= 60)
          activeCount++;
      }
    }
    this.ui.setSignalCount(activeCount);
    this.ui.setLastUpdate(new Date().toLocaleTimeString());
  }

  _aggregateCandles(candles, tf) {
    const tfMap = { "15m": 15, "1h": 60, "2h": 120, "4h": 240, "1d": 1440 };
    const minutes = tfMap[tf] || 60;
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
  }

  async _loadAssetData(asset) {
    if (this._loadingAssets.has(asset)) return;
    this._loadingAssets.add(asset);
    try {
      const symbol = CONFIG.symbolMap[asset];
      const candles = await this.dataLoader.fetchCandles(
        symbol,
        this.currentTF,
        CONFIG.historyCandles
      );
      if (candles && candles.length) {
        this.marketData.set(asset, candles);
        this._generateSignals();
        this.ui.setCacheStatus(`📊 ${this.marketData.size} активов`);
      }
    } finally {
      this._loadingAssets.delete(asset);
    }
  }

  destroy() {
    if (this.wsManager) this.wsManager.close();
    if (this._updateInterval) clearInterval(this._updateInterval);
    if (this._signalThrottle) clearTimeout(this._signalThrottle);
    this.sound.clearAll();
    console.log("🧹 Приложение уничтожено");
  }
}

// ---------- Запуск ----------
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.init();
  window.__app = app;
});
