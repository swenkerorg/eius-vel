import BigNumber from "bignumber.js";

export const formatNumberString = ({numberString, fragtionsCount = 0, roundMode = 1, suffix = ''}: {
  numberString: string,
  fragtionsCount?: number
  roundMode?: BigNumber.RoundingMode
  suffix?: string;
}) => {
  if (!numberString) return '0';
  if (typeof numberString !== 'string') {
    numberString = new BigNumber(numberString).toFixed();
  }

  const fmt = {
    prefix: '',
    decimalSeparator: '.',
    groupSeparator: ',',
    groupSize: 3,
    secondaryGroupSize: 0,
    fractionGroupSeparator: ' ',
    fractionGroupSize: 0,
    suffix: suffix,
  };
  BigNumber.config({ FORMAT: fmt });
  if (fragtionsCount) {
    return new BigNumber(numberString).toFormat(fragtionsCount, roundMode);
  }
  return new BigNumber(numberString).toFormat();
};