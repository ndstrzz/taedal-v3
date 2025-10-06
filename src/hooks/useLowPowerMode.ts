import { useEffect, useState } from 'react'
export function useLowPowerMode() {
  const [low, setLow] = useState(false)
  useEffect(() => {
    const cpu = (navigator as any).hardwareConcurrency || 4
    const mem = (navigator as any).deviceMemory || 4
    if (cpu <= 4 || mem <= 4) setLow(true)
  }, [])
  return low
}
