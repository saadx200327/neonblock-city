/* Cardfolio QA hotfixes. Loaded last so corrected functions replace earlier declarations. */
function hasNumericValue(value){
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}
function valued(h){
  return hasNumericValue(h.market_value) || hasNumericValue(h.manual_value);
}
function holdingValue(h){
  const unitValue = hasNumericValue(h.market_value)
    ? Number(h.market_value)
    : hasNumericValue(h.manual_value)
      ? Number(h.manual_value)
      : 0;
  return unitValue * Number(h.quantity || 1);
}
