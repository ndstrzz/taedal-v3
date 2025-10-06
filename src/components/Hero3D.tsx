import { Canvas } from '@react-three/fiber'
import { OrbitControls, Float, MeshDistortMaterial } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { flags } from '../lib/featureFlags'
import { Suspense } from 'react'

function Blob() {
  return (
    <mesh>
      <icosahedronGeometry args={[1, 32]} />
      <MeshDistortMaterial distort={0.35} speed={1.2} roughness={0.2} />
    </mesh>
  )
}

export default function Hero3D() {
  return (
    <div className="h-[60vh] w-full rounded-xl bg-elev1 shadow-card">
      <Canvas camera={{ position: [0, 0, 3], fov: 50 }}>
        <color attach="background" args={['#0b0b0c']} />
        <ambientLight intensity={1.2} />
        <Float speed={1.5} rotationIntensity={0.6} floatIntensity={1.2}>
          <Blob />
        </Float>
        <OrbitControls enableZoom={false} />
        {flags.postprocessing && (
          <EffectComposer>
            <Bloom luminanceThreshold={0.25} intensity={0.6} />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  )
}
