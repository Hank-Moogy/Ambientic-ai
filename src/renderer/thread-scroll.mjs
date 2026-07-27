export function isNearThreadBottom (element, threshold = 120) {
  if (!element) return true
  const remaining = Number(element.scrollHeight || 0) - Number(element.scrollTop || 0) - Number(element.clientHeight || 0)
  return remaining <= threshold
}
