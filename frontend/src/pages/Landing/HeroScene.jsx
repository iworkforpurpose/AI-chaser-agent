import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Float,
  Environment,
  PerspectiveCamera,
  ScrollControls,
  Scroll,
  useScroll,
  Text,
  MeshWobbleMaterial,
} from '@react-three/drei';
import * as THREE from 'three';

/* ── Sharp Hexagonal Prism ────────────────────────────────────── */
const FloatingHex = ({ position, color, scale = 1, speed = 1 }) => {
  const ref = useRef();
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const s = scroll.offset; // 0 → 1

    ref.current.rotation.x = t * 0.3 * speed + s * Math.PI * 2;
    ref.current.rotation.y = t * 0.2 * speed + s * Math.PI;
    ref.current.position.y = position[1] + Math.sin(t * speed) * 0.3 - s * 6;
    ref.current.position.x = position[0] + Math.cos(t * 0.5 * speed) * 0.15;
    ref.current.scale.setScalar(scale * (1 - s * 0.3));
  });

  return (
    <mesh ref={ref} position={position}>
      <cylinderGeometry args={[1, 1, 0.5, 6]} />
      <meshStandardMaterial
        color={color}
        roughness={0.05}
        metalness={1}
        envMapIntensity={3}
        flatShading
      />
    </mesh>
  );
};

/* ── Wobbling Torus ───────────────────────────────────────────── */
const WobblingRing = ({ position, color, speed = 1 }) => {
  const ref = useRef();
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const s = scroll.offset;

    ref.current.rotation.x = t * 0.15 * speed + s * Math.PI * 3;
    ref.current.rotation.z = t * 0.1 * speed;
    ref.current.position.y = position[1] - s * 8;
    ref.current.position.x = position[0] + Math.sin(s * Math.PI * 2) * 2;
  });

  return (
    <mesh ref={ref} position={position}>
      <torusGeometry args={[1.2, 0.4, 16, 32]} />
      <MeshWobbleMaterial
        color={color}
        roughness={0.2}
        metalness={0.8}
        factor={0.4}
        speed={1.5}
      />
    </mesh>
  );
};

/* ── Octahedron ───────────────────────────────────────────────── */
const FloatingOcta = ({ position, color, scale = 0.8 }) => {
  const ref = useRef();
  const scroll = useScroll();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const s = scroll.offset;

    ref.current.rotation.y = t * 0.4 + s * Math.PI * 4;
    ref.current.rotation.z = t * 0.2;
    ref.current.position.y = position[1] + Math.sin(t * 0.8) * 0.5 - s * 10;
    ref.current.position.z = position[2] + s * -4;
    ref.current.scale.setScalar(scale * (1 + s * 0.5));
  });

  return (
    <mesh ref={ref} position={position}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color={color}
        roughness={0.05}
        metalness={1}
        envMapIntensity={3}
      />
    </mesh>
  );
};

/* ── Particle Field ───────────────────────────────────────────── */
const StarField = ({ count = 200 }) => {
  const ref = useRef();
  const scroll = useScroll();

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      arr[i] = (Math.random() - 0.5) * 30;
      arr[i + 1] = (Math.random() - 0.5) * 40;
      arr[i + 2] = (Math.random() - 0.5) * 20;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    const s = scroll.offset;
    ref.current.rotation.y = s * Math.PI * 0.5;
    ref.current.position.y = -s * 12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#7bb6ff" transparent opacity={0.6} sizeAttenuation />
    </points>
  );
};

/* ── Camera Rig (moves with scroll) ──────────────────────────── */
const CameraRig = () => {
  const scroll = useScroll();
  const { camera } = useThree();

  useFrame((state) => {
    const s = scroll.offset;
    const t = state.clock.getElapsedTime();

    // Camera drifts down and forward as user scrolls
    camera.position.y = 0 - s * 6;
    camera.position.z = 8 - s * 3;
    camera.position.x = Math.sin(t * 0.1) * 0.3;
    camera.lookAt(0, -s * 6, 0);
  });

  return null;
};

/* ── Scene Content (inside ScrollControls) ────────────────────── */
function SceneContent({ children }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1.2} color="#7bb6ff" />
      <pointLight position={[-10, -5, 5]} intensity={0.6} color="#f59e0b" />
      <spotLight position={[0, 15, 0]} intensity={0.8} angle={0.5} penumbra={1} color="#ffffff" />

      <CameraRig />
      <StarField count={300} />

      {/* Section 1: Hero — centered gems */}
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1.5}>
        <FloatingHex position={[0, 0, 0]} color="#3b82f6" scale={1.4} speed={0.6} />
      </Float>
      <Float speed={2} rotationIntensity={0.8} floatIntensity={1}>
        <FloatingHex position={[-3.5, 0.5, -2]} color="#0ea5e9" scale={0.7} speed={1} />
      </Float>
      <Float speed={1.8} rotationIntensity={0.6} floatIntensity={1.2}>
        <FloatingHex position={[3.5, -0.5, -3]} color="#8b5cf6" scale={0.6} speed={0.9} />
      </Float>

      {/* Section 2: Rules — rings float into view */}
      <WobblingRing position={[-4, -7, -1]} color="#f59e0b" speed={0.7} />
      <WobblingRing position={[4, -8, -2]} color="#ef4444" speed={0.5} />

      {/* Section 3: CTA — big octahedron */}
      <FloatingOcta position={[0, -14, -1]} color="#22c55e" scale={1.2} />
      <Float speed={1} rotationIntensity={1} floatIntensity={2}>
        <FloatingHex position={[-3, -15, -3]} color="#f59e0b" scale={0.5} speed={1.2} />
      </Float>
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1}>
        <FloatingHex position={[3, -13, -2]} color="#3b82f6" scale={0.4} speed={0.8} />
      </Float>

      <Environment preset="city" />

      {/* HTML Content overlaid on top of 3D */}
      <Scroll html style={{ width: '100%' }}>
        {children}
      </Scroll>
    </>
  );
}

/* ── Main Export ──────────────────────────────────────────────── */
export default function HeroScene({ children }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
      <Canvas gl={{ antialias: true, alpha: true }}>
        <PerspectiveCamera makeDefault position={[0, 0, 8]} fov={50} />
        <ScrollControls pages={4} damping={0.25}>
          <SceneContent>{children}</SceneContent>
        </ScrollControls>
      </Canvas>
    </div>
  );
}
