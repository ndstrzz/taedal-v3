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

// Temporary stub: remove three/r3f/drei at build time
export default function Hero3D() {
  return null; // (or return a tiny SVG/placeholder if you want)
}

