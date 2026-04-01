const POINT_VALUE_MAP: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  SIL: 1000
};

const TICK_SIZE_MAP: Record<string, number> = {
  ES: 0.25,
  MES: 0.25,
  NQ: 0.25,
  MNQ: 0.25,
  YM: 1,
  MYM: 1,
  RTY: 0.1,
  M2K: 0.1,
  CL: 0.01,
  MCL: 0.01,
  GC: 0.1,
  MGC: 0.1,
  SI: 0.005,
  SIL: 0.005
};

export const instrumentKey = (instrument: string) => instrument.split(' ')[0] || instrument;

export const pointValueFor = (instrument: string) => {
  const key = instrumentKey(instrument).toUpperCase();
  return POINT_VALUE_MAP[key] ?? 1;
};

export const tickSizeFor = (instrument: string) => {
  const key = instrumentKey(instrument).toUpperCase();
  return TICK_SIZE_MAP[key] ?? 1;
};

export const tickValueFor = (instrument: string) => pointValueFor(instrument) * tickSizeFor(instrument);
