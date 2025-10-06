import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'

function Blob() {
  const mesh = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => {
    if (!mesh.current) return
    mesh.current.rotation.y += dt * 0.3
    mesh.current.rotation.x += dt * 0.15
  })
  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.2, 2]} />
      <meshStandardMaterial roughness={0.35} metalness={0.4} color="#cfd4ff" />
    </mesh>
  )
}

export default function Hero3D() {
  return (
    <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl ring-1 ring-border">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <color attach="background" args={['#0e0f12']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} intensity={1.2} />
        <directionalLight position={[-2, -1, -2]} intensity={0.4} />
        <Suspense fallback={null}>
          <Blob />
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} />
      </Canvas>
    </div>
  )
}
