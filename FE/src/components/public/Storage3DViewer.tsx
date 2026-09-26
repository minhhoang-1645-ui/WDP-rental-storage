import { ContactShadows, Line, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Box, MousePointer2, Rotate3D, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { StorageSize, StorageSizeId } from '../../types/storage'

type ControlKind = 'reset' | 'rotate' | 'zoom-in' | 'zoom-out'

interface ControlAction {
  id: number
  kind: ControlKind
}

interface ModelProps {
  file: string
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: number | [number, number, number]
}

interface ViewerProps {
  size: StorageSize
}

const assetRoot = '/models/kenney-furniture-kit'

function parseDimensions(dimensions: string) {
  const values = dimensions.replaceAll(',', '.').match(/\d+(?:\.\d+)?/g)?.map(Number)
  return {
    width: values?.[0] ?? 1,
    depth: values?.[1] ?? 1,
    height: values?.[2] ?? 1,
  }
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function AssetModel({ file, position, rotation = [0, 0, 0], scale = 1 }: ModelProps) {
  const { scene } = useGLTF(`${assetRoot}/${file}`)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  useEffect(() => {
    clonedScene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }, [clonedScene])

  return <primitive object={clonedScene} position={position} rotation={rotation} scale={scale} />
}

function Suitcase({ position, scale = 1 }: { position: [number, number, number], scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh castShadow position={[0, .34, 0]}>
      <boxGeometry args={[.5, .68, .24]} />
      <meshStandardMaterial color="#d97706" roughness={.75} />
    </mesh>
    <mesh castShadow position={[0, .77, 0]}>
      <torusGeometry args={[.13, .025, 8, 20, Math.PI]} />
      <meshStandardMaterial color="#334155" roughness={.5} />
    </mesh>
    <mesh position={[-.17, .02, .08]}><cylinderGeometry args={[.035, .035, .08, 12]} /><meshStandardMaterial color="#1e293b" /></mesh>
    <mesh position={[.17, .02, .08]}><cylinderGeometry args={[.035, .035, .08, 12]} /><meshStandardMaterial color="#1e293b" /></mesh>
  </group>
}

function Bicycle({ position, rotation = [0, 0, 0], scale = 1 }: Omit<ModelProps, 'file'>) {
  const framePoints: [number, number, number][] = [
    [-.42, .42, 0], [0, .42, 0], [-.16, .76, 0], [-.42, .42, 0],
    [0, .42, 0], [.43, .42, 0], [.24, .78, 0], [0, .42, 0],
  ]
  return <group position={position} rotation={rotation} scale={scale}>
    <mesh castShadow position={[-.43, .4, 0]}><torusGeometry args={[.36, .035, 10, 28]} /><meshStandardMaterial color="#1e293b" roughness={.45} /></mesh>
    <mesh castShadow position={[.43, .4, 0]}><torusGeometry args={[.36, .035, 10, 28]} /><meshStandardMaterial color="#1e293b" roughness={.45} /></mesh>
    <Line points={framePoints} color="#e98b2a" lineWidth={4} />
    <Line points={[[.24, .78, 0], [.34, .94, 0], [.5, .94, 0]]} color="#1e293b" lineWidth={3} />
    <Line points={[[.24, .78, 0], [.12, .98, 0]]} color="#1e293b" lineWidth={3} />
    <mesh castShadow position={[-.17, .8, 0]}><boxGeometry args={[.25, .05, .12]} /><meshStandardMaterial color="#334155" /></mesh>
  </group>
}

function BoxCluster({ origin, count, scale = 1 }: { origin: [number, number, number], count: number, scale?: number }) {
  const placements: Array<[number, number, number]> = [
    [0, 0, 0], [.42, 0, .02], [.2, .38, 0], [-.34, 0, .1], [-.2, .36, .08], [.52, .36, .04],
  ]
  return <group position={origin} scale={scale}>
    {placements.slice(0, count).map((position, index) => <AssetModel
      key={`${position.join('-')}-${index}`}
      file={index === count - 1 && count > 2 ? 'cardboardBoxOpen.glb' : 'cardboardBoxClosed.glb'}
      position={position}
      rotation={[0, index % 2 ? .15 : -.12, 0]}
      scale={1.65}
    />)}
  </group>
}

function RoomContents({ sizeId }: { sizeId: StorageSizeId }) {
  if (sizeId === 'locker') return <>
    <BoxCluster origin={[-.2, 0, -.15]} count={3} scale={.86} />
    <Suitcase position={[.23, 0, .2]} scale={.72} />
  </>

  if (sizeId === 'small') return <>
    <AssetModel file="bedSingle.glb" position={[-.18, 0, -.2]} rotation={[0, Math.PI / 2, 0]} scale={1.65} />
    <BoxCluster origin={[-.42, 0, .52]} count={3} scale={.82} />
    <Bicycle position={[.32, 0, -.86]} rotation={[0, -.16, 0]} scale={.92} />
  </>

  if (sizeId === 'medium') return <>
    <AssetModel file="loungeSofa.glb" position={[-.45, 0, -.72]} rotation={[0, .12, 0]} scale={1.45} />
    <AssetModel file="kitchenFridge.glb" position={[.58, 0, -.92]} rotation={[0, -.08, 0]} scale={1.75} />
    <AssetModel file="bookcaseOpen.glb" position={[-.72, 0, .18]} rotation={[0, Math.PI / 2, 0]} scale={1.65} />
    <BoxCluster origin={[.48, 0, .45]} count={4} scale={.9} />
  </>

  return <>
    <AssetModel file="bedDouble.glb" position={[-.75, 0, -.75]} rotation={[0, Math.PI / 2, 0]} scale={1.7} />
    <AssetModel file="loungeSofa.glb" position={[.72, 0, -.95]} rotation={[0, -.08, 0]} scale={1.75} />
    <AssetModel file="kitchenFridge.glb" position={[1.02, 0, .38]} rotation={[0, -.1, 0]} scale={1.9} />
    <AssetModel file="bookcaseOpen.glb" position={[-1.08, 0, .45]} rotation={[0, Math.PI / 2, 0]} scale={1.85} />
    <AssetModel file="table.glb" position={[.12, 0, .55]} rotation={[0, .08, 0]} scale={1.8} />
    <BoxCluster origin={[-.25, 0, 1.1]} count={6} scale={.95} />
    <Bicycle position={[.86, 0, 1.18]} rotation={[0, -.18, 0]} scale={1.05} />
  </>
}

function StorageRoom({ size }: { size: StorageSize }) {
  const { width, depth, height } = parseDimensions(size.dimensions)
  const floorOutline: [number, number, number][] = [
    [-width / 2, .015, -depth / 2], [width / 2, .015, -depth / 2],
    [width / 2, .015, depth / 2], [-width / 2, .015, depth / 2], [-width / 2, .015, -depth / 2],
  ]

  return <group>
    <mesh receiveShadow position={[0, -.035, 0]}>
      <boxGeometry args={[width, .07, depth]} />
      <meshStandardMaterial color="#bfcdd8" roughness={.95} metalness={.02} />
    </mesh>
    <mesh receiveShadow position={[0, height / 2, -depth / 2]}>
      <boxGeometry args={[width, height, .06]} />
      <meshStandardMaterial color="#d8e4ed" roughness={.88} />
    </mesh>
    <mesh receiveShadow position={[-width / 2, height / 2, 0]}>
      <boxGeometry args={[.06, height, depth]} />
      <meshStandardMaterial color="#c7d5e0" roughness={.9} />
    </mesh>
    <mesh receiveShadow position={[width / 2, height / 2, 0]}>
      <boxGeometry args={[.06, height, depth]} />
      <meshStandardMaterial color="#d9e5ee" transparent opacity={.18} depthWrite={false} roughness={.9} />
    </mesh>
    <mesh position={[0, .06, -depth / 2 + .036]}>
      <boxGeometry args={[width * .86, .055, .025]} />
      <meshStandardMaterial color="#e98b2a" roughness={.72} />
    </mesh>
    <Line points={floorOutline} color="#71859a" lineWidth={1.25} />
    <RoomContents sizeId={size.id} />
  </group>
}

function CameraControls({ size, action }: { size: StorageSize, action: ControlAction }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size: canvasSize } = useThree()
  const { width, depth, height } = parseDimensions(size.dimensions)
  const aspect = Math.max(canvasSize.width / canvasSize.height, .75)
  const verticalFov = THREE.MathUtils.degToRad(camera instanceof THREE.PerspectiveCamera ? camera.fov : 36)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
  const projectedWidth = width * .82 + depth * .58
  const projectedHeight = height * .85 + depth * .42
  const fitRatio = .72
  const fitDistance = Math.max(
    projectedWidth / (2 * Math.tan(horizontalFov / 2) * fitRatio),
    projectedHeight / (2 * Math.tan(verticalFov / 2) * fitRatio),
  )
  const minDistance = fitDistance * .58
  const maxDistance = fitDistance * 1.62

  useEffect(() => {
    const target = new THREE.Vector3(0, height * .42, -depth * .06)
    const direction = new THREE.Vector3(1.05, .72, 1.45).normalize()
    camera.position.copy(target).addScaledVector(direction, fitDistance)
    camera.lookAt(target)
    if (controls.current) {
      controls.current.target.copy(target)
      controls.current.update()
      controls.current.saveState()
    }
  }, [camera, depth, fitDistance, height, size.id])

  useEffect(() => {
    if (!controls.current || action.id === 0) return
    const orbit = controls.current
    if (action.kind === 'reset') {
      orbit.reset()
      return
    }
    if (action.kind === 'zoom-in' || action.kind === 'zoom-out') {
      const direction = camera.position.clone().sub(orbit.target)
      const nextDistance = THREE.MathUtils.clamp(
        direction.length() * (action.kind === 'zoom-in' ? .82 : 1.18),
        minDistance,
        maxDistance,
      )
      direction.setLength(nextDistance)
      camera.position.copy(orbit.target.clone().add(direction))
      orbit.update()
      return
    }
    const offset = camera.position.clone().sub(orbit.target)
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 5)
    camera.position.copy(orbit.target.clone().add(offset))
    camera.lookAt(orbit.target)
    orbit.update()
  }, [action, camera, maxDistance, minDistance])

  return <OrbitControls
    ref={controls}
    makeDefault
    enablePan={false}
    enableDamping
    dampingFactor={.08}
    minDistance={minDistance}
    maxDistance={maxDistance}
    minPolarAngle={.38}
    maxPolarAngle={Math.PI / 2.12}
    minAzimuthAngle={-Math.PI / 2.35}
    maxAzimuthAngle={Math.PI / 2.35}
    rotateSpeed={.62}
    zoomSpeed={.72}
  />
}

function Scene({ size, action }: { size: StorageSize, action: ControlAction }) {
  const { width, depth, height } = parseDimensions(size.dimensions)
  const shadowScale = Math.max(width, depth) * 1.08

  return <>
    <color attach="background" args={['#e7eff6']} />
    <hemisphereLight args={['#ffffff', '#8da1b3', 1.25]} />
    <ambientLight intensity={.55} />
    <directionalLight castShadow position={[4, 7, 6]} intensity={2.65} shadow-mapSize={[1536, 1536]} shadow-bias={-.0004} />
    <directionalLight position={[-4, 4, 3]} intensity={1.1} color="#d9e9f6" />
    <directionalLight position={[1, 2, -5]} intensity={.65} color="#ffd8ad" />
    <Suspense fallback={null}>
      <StorageRoom size={size} />
      <ContactShadows position={[0, -.025, 0]} opacity={.34} scale={shadowScale} blur={2.8} far={height + .8} color="#52687a" />
    </Suspense>
    <CameraControls size={size} action={action} />
  </>
}

function StaticFallback({ size }: { size: StorageSize }) {
  return <div className="viewer-fallback" role="img" aria-label={`Ảnh minh họa cho ${size.name}`}>
    <img src={size.image} alt="" />
    <div><Box size={22} /><strong>Đang dùng bản xem tĩnh</strong><span>Thiết bị này không hỗ trợ WebGL. Thông tin kích thước vẫn được giữ nguyên.</span></div>
  </div>
}

class ViewerErrorBoundary extends Component<{ children: ReactNode, fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Storage 3D viewer failed to render', error, info)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

export default function Storage3DViewer({ size }: ViewerProps) {
  const [action, setAction] = useState<ControlAction>({ id: 0, kind: 'reset' })
  const [webGLAvailable] = useState(() => supportsWebGL())
  const runControl = (kind: ControlKind) => setAction(current => ({ id: current.id + 1, kind }))

  if (!webGLAvailable) return <StaticFallback size={size} />

  return <ViewerErrorBoundary key={size.id} fallback={<StaticFallback size={size} />}>
    <div className="storage-viewer" id="size-visualisation">
      <Canvas shadows camera={{ fov: 36, near: .05, far: 100 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
        <Scene size={size} action={action} />
      </Canvas>
      <div className="viewer-badge"><span />Mô phỏng 3D theo tỷ lệ</div>
      <div className="viewer-controls" aria-label="Điều khiển mô hình 3D">
        <button type="button" onClick={() => runControl('rotate')} aria-label="Xoay mô hình" title="Xoay mô hình"><Rotate3D size={18} /></button>
        <button type="button" onClick={() => runControl('zoom-in')} aria-label="Phóng to" title="Phóng to"><ZoomIn size={18} /></button>
        <button type="button" onClick={() => runControl('zoom-out')} aria-label="Thu nhỏ" title="Thu nhỏ"><ZoomOut size={18} /></button>
        <button type="button" onClick={() => runControl('reset')} aria-label="Đặt lại góc nhìn" title="Đặt lại góc nhìn"><RotateCcw size={18} /></button>
      </div>
      <div className="viewer-hint"><MousePointer2 size={15} /> Kéo để xoay · Cuộn hoặc chụm để thu phóng</div>
    </div>
  </ViewerErrorBoundary>
}
