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

// Temporary placeholder to keep TypeScript happy without drei/three deps
export default function Hero3D() {
  return (
    <div className="aspect-[4/3] w-full rounded-xl bg-elev1 ring-1 ring-border grid place-items-center">
      <div className="text-subtle text-sm">3D hero temporarily disabled</div>
    </div>
  )
}
