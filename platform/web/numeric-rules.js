export const isMoney=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e12;
export const roundQuantity=value=>Math.round(value*1000)/1000;
export const isQuantity=value=>Number.isFinite(value)&&value>0&&value<=1e6&&Math.abs(value*1000-Math.round(value*1000))<1e-5;
