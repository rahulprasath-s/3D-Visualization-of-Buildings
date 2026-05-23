import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF } from '@react-three/drei';

const Model = ({ url }) => {
  // Try to load the model, fallback to a placeholder if it fails or url is missing
  try {
    const { scene } = useGLTF(url);
    return <primitive object={scene} />;
  } catch (e) {
    // Return placeholder
    return (
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2, 4, 2]} />
        <meshStandardMaterial color="#4f46e5" wireframe />
      </mesh>
    );
  }
};

const Viewer3D = ({ modelUrl, onBack }) => {
  return (
    <div className="viewer-container">
      <div className="viewer-header">
        <button onClick={onBack} className="back-button">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to Map
        </button>
        <h2>3D View</h2>
      </div>
      
      <div className="canvas-wrapper">
        <Canvas shadows camera={{ position: [0, 5, 10], fov: 50 }}>
          <color attach="background" args={['#0a0a0f']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} castShadow />
          
          <Suspense fallback={
            <mesh>
              <boxGeometry args={[2, 4, 2]} />
              <meshStandardMaterial color="#4f46e5" wireframe />
            </mesh>
          }>
            <Stage environment="city" intensity={0.6}>
              {modelUrl ? (
                <Model url={modelUrl} />
              ) : (
                <mesh position={[0, 2, 0]}>
                  <boxGeometry args={[3, 8, 3]} />
                  <meshStandardMaterial color="#4f46e5" roughness={0.2} metalness={0.8} />
                </mesh>
              )}
            </Stage>
          </Suspense>
          <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} />
        </Canvas>
      </div>
    </div>
  );
};

// Preload common models
// useGLTF.preload('/models/building-a.glb');

export default Viewer3D;
