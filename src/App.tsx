import { useEffect } from 'react'
import { motion } from 'framer-motion'
import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import usePrefersReducedMotion from './hooks/usePrefersReducedMotion'
import { useLowPowerMode } from './hooks/useLowPowerMode'
import { flags } from './lib/featureFlags'
import NavBar from './components/NavBar'
import Hero3D from './components/Hero3D'
import FallbackHero from './components/FallbackHero'
import VerifyEmailBanner from './components/VerifyEmailBanner'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  const prefersReduce = usePrefersReducedMotion()
  const lowPower = useLowPowerMode()

  useEffect(() => {
    const lenis = new Lenis()
    const raf = (time: number) => {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
    return () => { /* lenis cleans on GC */ }
  }, [])

  const show3D = flags.r3fHero && !prefersReduce && !lowPower

  return (
    <div className="min-h-screen bg-bg text-text">
      <NavBar />
      <main className="mx-auto max-w-6xl px-4">
        {/* Show verify banner for users who haven't confirmed email */}
        <VerifyEmailBanner />

        <section className="py-12">
          <motion.h1
            className="mb-4 text-display font-semibold tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Create. Prove. Sell — with provenance.
          </motion.h1>
          <p className="mb-8 max-w-2xl text-body text-subtle">
            Mint digital & physical art, track licensing, and let buyers verify authenticity via QR/NFC.
          </p>
          {show3D ? <Hero3D /> : <FallbackHero />}
        </section>
      </main>
    </div>
  )
}
