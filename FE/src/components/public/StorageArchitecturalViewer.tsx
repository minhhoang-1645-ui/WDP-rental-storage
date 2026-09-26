import { ContactShadows, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Box, MousePointer2, Rotate3D, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { StorageSize, StorageSizeId } from '../../types/storage'

type AssetCollection = 'factory' | 'furniture'
type ControlKind = 'reset' | 'rotate' | 'zoom-in' | 'zoom-out'

interface ControlAction {
  id: number
  kind: ControlKind
}

interface ViewerProps {
  size: StorageSize
}

interface LicensedModelProps {
  collection: AssetCollection
  file: string
  position: [number, number, number]
  target: [number, number, number]
  rotation?: [number, number, number]
  stretch?: boolean
}

const assetRoots: Record<AssetCollection, string> = {
  factory: '/models/kenney-factory-kit',
  furniture: '/models/kenney-furniture-kit',
}

function parseDimensions(dimensions: string) {
  const values = dimensions.replaceAll(',', '.').match(/\d+(?:\.\d+)?/g)?.map(Number)
  return { width: values?.[0] ?? 1, depth: values?.[1] ?? 1, height: values?.[2] ?? 1 }
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function LicensedModel({ collection, file, position, target, rotation = [0, 0, 0], stretch = false }: LicensedModelProps) {
  const { scene } = useGLTF(`${assetRoots[collection]}/${file}`)
  const [targetX, targetY, targetZ] = target
  const object = useMemo(() => {
    const clone = scene.clone(true)
    const bounds = new THREE.Box3().setFromObject(clone)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const ratios = new THREE.Vector3(
      targetX / Math.max(size.x, .001),
      targetY / Math.max(size.y, .001),
      targetZ / Math.max(size.z, .001),
    )
    const scalar = Math.min(ratios.x, ratios.y, ratios.z)
    const appliedScale = stretch ? ratios : new THREE.Vector3(scalar, scalar, scalar)
    clone.scale.copy(appliedScale)
    clone.position.set(-center.x * appliedScale.x, -bounds.min.y * appliedScale.y, -center.z * appliedScale.z)
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.roughness = Math.max(child.material.roughness, .48)
          child.material.envMapIntensity = .65
        }
      }
    })
    return clone
  }, [scene, stretch, targetX, targetY, targetZ])

  return <group position={position} rotation={rotation}><primitive object={object} /></group>
}

function PanelWall({ length, height, position, rotation = [0, 0, 0] }: { length: number, height: number, position: [number, number, number], rotation?: [number, number, number] }) {
  const count = Math.max(2, Math.ceil(length / .72))
  const panelWidth = length / count
  return <group position={position} rotation={rotation}>
    {Array.from({ length: count }, (_, index) => {
      const x = -length / 2 + panelWidth / 2 + index * panelWidth
      return <group key={index} position={[x, 0, 0]}>
        <mesh receiveShadow position={[0, height / 2, 0]}>
          <boxGeometry args={[panelWidth - .018, height, .055]} />
          <meshStandardMaterial color={index % 2 ? '#d8e3eb' : '#e2eaf0'} roughness={.82} metalness={.08} />
        </mesh>
        <mesh castShadow position={[-panelWidth / 2, height / 2, .038]}>
          <boxGeometry args={[.025, height + .04, .045]} />
          <meshStandardMaterial color="#718294" roughness={.5} metalness={.58} />
        </mesh>
      </group>
    })}
    <mesh position={[0, .075, .045]}>
      <boxGeometry args={[length * .9, .065, .04]} />
      <meshStandardMaterial color="#e98b2a" roughness={.64} />
    </mesh>
  </group>
}

function RollUpDoor({ width, height, depth }: { width: number, height: number, depth: number }) {
  const openingWidth = width * .91
  const frameColor = '#34495e'
  return <group position={[0, 0, depth / 2 + .035]}>
    <LicensedModel collection="factory" file="structure-doorway-wide.glb" position={[0, 0, 0]} target={[width + .08, height, .22]} stretch />
    <mesh castShadow position={[-openingWidth / 2, height / 2, .07]}>
      <boxGeometry args={[.065, height, .1]} /><meshStandardMaterial color={frameColor} roughness={.42} metalness={.65} />
    </mesh>
    <mesh castShadow position={[openingWidth / 2, height / 2, .07]}>
      <boxGeometry args={[.065, height, .1]} /><meshStandardMaterial color={frameColor} roughness={.42} metalness={.65} />
    </mesh>
    <mesh castShadow position={[0, height - .08, .07]}>
      <boxGeometry args={[openingWidth, .12, .11]} /><meshStandardMaterial color={frameColor} roughness={.42} metalness={.65} />
    </mesh>
    {Array.from({ length: 5 }, (_, index) => <mesh key={index} castShadow position={[0, height - .18 - index * .085, .1]}>
      <boxGeometry args={[openingWidth * .96, .075, .055]} />
      <meshStandardMaterial color={index % 2 ? '#b7c5d0' : '#c7d2db'} roughness={.55} metalness={.38} />
    </mesh>)}
    <mesh castShadow position={[0, height - .06, .02]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[.105, .105, openingWidth * .9, 24]} />
      <meshStandardMaterial color="#65798c" roughness={.46} metalness={.6} />
    </mesh>
    <mesh position={[0, .018, .09]}>
      <boxGeometry args={[openingWidth, .035, .16]} /><meshStandardMaterial color="#e98b2a" roughness={.7} />
    </mesh>
  </group>
}

function MetalRack({ position, rotation = [0, 0, 0], width = .75, height = 1.75, depth = .42, stocked = true }: { position: [number, number, number], rotation?: [number, number, number], width?: number, height?: number, depth?: number, stocked?: boolean }) {
  const shelfLevels = [.12, .64, 1.16, height - .08]
  return <group position={position} rotation={rotation}>
    {[-1, 1].flatMap(x => [-1, 1].map(z => <mesh key={`${x}-${z}`} castShadow position={[x * (width / 2 - .025), height / 2, z * (depth / 2 - .025)]}>
      <boxGeometry args={[.045, height, .045]} /><meshStandardMaterial color="#32475a" roughness={.38} metalness={.7} />
    </mesh>))}
    {shelfLevels.map((y, index) => <mesh key={y} castShadow receiveShadow position={[0, y, 0]}>
      <boxGeometry args={[width, .045, depth]} /><meshStandardMaterial color={index % 2 ? '#9eafbd' : '#b5c2cc'} roughness={.5} metalness={.45} />
    </mesh>)}
    {stocked && <>
      <LicensedModel collection="factory" file="box-small.glb" position={[-width * .22, .16, 0]} target={[.28, .28, depth * .72]} />
      <LicensedModel collection="factory" file="box-wide.glb" position={[width * .2, .68, 0]} target={[.34, .26, depth * .72]} />
      <LicensedModel collection="factory" file="box-long.glb" position={[0, 1.2, 0]} target={[width * .7, .25, depth * .7]} />
    </>}
  </group>
}

function BoxStack({ position, scale = 1 }: { position: [number, number, number], scale?: number }) {
  return <group position={position} scale={scale}>
    <LicensedModel collection="factory" file="box-large.glb" position={[-.23, 0, 0]} target={[.44, .42, .42]} />
    <LicensedModel collection="factory" file="box-wide.glb" position={[.22, 0, .02]} target={[.4, .34, .42]} />
    <LicensedModel collection="factory" file="box-small.glb" position={[-.12, .43, 0]} target={[.32, .3, .34]} />
  </group>
}

function Suitcase({ position, rotation = [0, 0, 0] }: { position: [number, number, number], rotation?: [number, number, number] }) {
  return <group position={position} rotation={rotation}>
    <RoundedBox args={[.42, .62, .22]} radius={.045} smoothness={4} castShadow position={[0, .33, 0]}>
      <meshStandardMaterial color="#d87820" roughness={.58} metalness={.08} />
    </RoundedBox>
    <mesh castShadow position={[0, .7, 0]}><torusGeometry args={[.105, .018, 10, 24, Math.PI]} /><meshStandardMaterial color="#283b4d" roughness={.45} /></mesh>
    <mesh position={[-.14, .015, .07]}><cylinderGeometry args={[.025, .025, .06, 12]} /><meshStandardMaterial color="#263747" /></mesh>
    <mesh position={[.14, .015, .07]}><cylinderGeometry args={[.025, .025, .06, 12]} /><meshStandardMaterial color="#263747" /></mesh>
  </group>
}

function StoredContents({ sizeId }: { sizeId: StorageSizeId }) {
  if (sizeId === 'locker') return <>
    <BoxStack position={[-.05, 0, -.17]} scale={.72} />
    <Suitcase position={[.25, 0, .2]} rotation={[0, -.18, 0]} />
  </>

  if (sizeId === 'small') return <>
    <LicensedModel collection="furniture" file="bedSingle.glb" position={[-.28, 0, -.06]} target={[.78, .58, 1.72]} />
    <MetalRack position={[.47, 0, -.72]} width={.48} height={1.72} depth={.34} />
    <BoxStack position={[.38, 0, .53]} scale={.72} />
  </>

  if (sizeId === 'medium') return <>
    <LicensedModel collection="furniture" file="loungeSofa.glb" position={[-.2, 0, -.94]} target={[1.48, .78, .68]} />
    <LicensedModel collection="furniture" file="kitchenFridge.glb" position={[.63, 0, -.95]} target={[.64, 1.72, .58]} />
    <MetalRack position={[-.72, 0, .26]} rotation={[0, Math.PI / 2, 0]} width={.82} height={1.82} depth={.4} />
    <BoxStack position={[.5, 0, .52]} scale={.9} />
  </>

  return <>
    <LicensedModel collection="furniture" file="bedDouble.glb" position={[-.68, 0, -.78]} target={[1.48, .62, 1.92]} />
    <LicensedModel collection="furniture" file="loungeSofa.glb" position={[.7, 0, -1.28]} target={[1.58, .78, .68]} />
    <LicensedModel collection="furniture" file="kitchenFridge.glb" position={[1.08, 0, .25]} target={[.68, 1.78, .62]} />
    <LicensedModel collection="furniture" file="table.glb" position={[.18, 0, .58]} target={[1.2, .7, .72]} />
    <MetalRack position={[-1.12, 0, .72]} rotation={[0, Math.PI / 2, 0]} width={1.02} height={1.9} depth={.45} />
    <BoxStack position={[-.22, 0, 1.32]} scale={1.05} />
  </>
}

function ArchitecturalUnit({ size }: { size: StorageSize }) {
  const { width, depth, height } = parseDimensions(size.dimensions)
  return <group>
    <mesh receiveShadow position={[0, -.065, 0]}><boxGeometry args={[width + .1, .1, depth + .1]} /><meshStandardMaterial color="#7d8d99" roughness={.9} /></mesh>
    <LicensedModel collection="factory" file="floor-large.glb" position={[0, -.012, 0]} target={[width, .085, depth]} stretch />
    <PanelWall length={width} height={height} position={[0, 0, -depth / 2]} />
    <PanelWall length={depth} height={height} position={[-width / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
    <RollUpDoor width={width} height={height} depth={depth} />
    <mesh position={[width / 2, height / 2, -depth / 2]}><boxGeometry args={[.065, height + .08, .065]} /><meshStandardMaterial color="#34495e" roughness={.42} metalness={.65} /></mesh>
    <mesh position={[0, height - .18, -depth / 2 + .04]}><boxGeometry args={[Math.min(width * .58, 1.4), .26, .04]} /><meshStandardMaterial color="#1e3a5f" roughness={.58} /></mesh>
    <mesh position={[0, height - .18, -depth / 2 + .065]}><boxGeometry args={[Math.min(width * .22, .5), .045, .02]} /><meshStandardMaterial color="#e98b2a" roughness={.62} /></mesh>
    <StoredContents sizeId={size.id} />
  </group>
}

function CameraRig({ root, size, action }: { root: React.RefObject<THREE.Group | null>, size: StorageSize, action: ControlAction }) {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera, size: canvasSize } = useThree()
  const limits = useRef({ min: 1, max: 10 })

  useLayoutEffect(() => {
    if (!root.current || !(camera instanceof THREE.PerspectiveCamera)) return
    const bounds = new THREE.Box3().setFromObject(root.current)
    const center = bounds.getCenter(new THREE.Vector3())
    const direction = new THREE.Vector3(1.08, .72, 1.48).normalize()
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize()
    const up = new THREE.Vector3().crossVectors(direction, right).normalize()
    const corners = [
      [bounds.min.x, bounds.min.y, bounds.min.z], [bounds.min.x, bounds.min.y, bounds.max.z],
      [bounds.min.x, bounds.max.y, bounds.min.z], [bounds.min.x, bounds.max.y, bounds.max.z],
      [bounds.max.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.min.y, bounds.max.z],
      [bounds.max.x, bounds.max.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.max.z],
    ].map(value => new THREE.Vector3(...value).sub(center))
    const halfWidth = Math.max(...corners.map(point => Math.abs(point.dot(right))))
    const halfHeight = Math.max(...corners.map(point => Math.abs(point.dot(up))))
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (canvasSize.width / canvasSize.height))
    const distance = Math.max(halfWidth / Math.tan(horizontalFov / 2), halfHeight / Math.tan(verticalFov / 2)) * 1.27
    center.y += bounds.getSize(new THREE.Vector3()).y * .02
    camera.position.copy(center).addScaledVector(direction, distance)
    camera.lookAt(center)
    limits.current = { min: distance * .62, max: distance * 1.58 }
    if (controls.current) {
      controls.current.target.copy(center)
      controls.current.minDistance = limits.current.min
      controls.current.maxDistance = limits.current.max
      controls.current.update()
      controls.current.saveState()
    }
  }, [camera, canvasSize.height, canvasSize.width, root, size.id])

  useEffect(() => {
    const orbit = controls.current
    if (!orbit || action.id === 0) return
    if (action.kind === 'reset') return orbit.reset()
    const offset = camera.position.clone().sub(orbit.target)
    if (action.kind === 'rotate') offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6)
    else offset.setLength(THREE.MathUtils.clamp(offset.length() * (action.kind === 'zoom-in' ? .82 : 1.18), limits.current.min, limits.current.max))
    camera.position.copy(orbit.target).add(offset)
    camera.lookAt(orbit.target)
    orbit.update()
  }, [action, camera])

  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={.08} minPolarAngle={.42} maxPolarAngle={Math.PI / 2.08} minAzimuthAngle={-Math.PI / 2.25} maxAzimuthAngle={Math.PI / 2.25} rotateSpeed={.62} zoomSpeed={.72} />
}

function ArchitectureScene({ size, action, onReady }: { size: StorageSize, action: ControlAction, onReady: () => void }) {
  const root = useRef<THREE.Group>(null)
  const { width, depth, height } = parseDimensions(size.dimensions)
  useEffect(() => onReady(), [onReady, size.id])

  return <>
    <color attach="background" args={['#f1f5f8']} />
    <hemisphereLight args={['#ffffff', '#9aabba', 1.15]} />
    <ambientLight intensity={.48} />
    <directionalLight castShadow position={[4, 7, 6]} intensity={2.15} shadow-mapSize={[2048, 2048]} shadow-bias={-.00035} />
    <directionalLight position={[-4, 3, 4]} intensity={.78} color="#d9eaf6" />
    <directionalLight position={[2, 2, -5]} intensity={.52} color="#ffd9af" />
    <group ref={root}><ArchitecturalUnit size={size} /></group>
    <ContactShadows position={[0, .006, 0]} scale={Math.min(width, depth) * .9} opacity={.22} blur={2.6} far={height + .5} color="#405464" />
    <CameraRig root={root} size={size} action={action} />
  </>
}

function StaticFallback({ size }: { size: StorageSize }) {
  return <div className="viewer-fallback" role="img" aria-label={`Ảnh minh họa cho ${size.name}`}><img src={size.image} alt="" /><div><Box size={22} /><strong>Bản xem kiến trúc tĩnh</strong><span>Thiết bị này không hỗ trợ WebGL. Kích thước và thông tin sức chứa vẫn được giữ nguyên.</span></div></div>
}

class ViewerErrorBoundary extends Component<{ children: ReactNode, fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Architectural storage viewer failed', error, info) }
  render() { return this.state.hasError ? this.props.fallback : this.props.children }
}

export default function StorageArchitecturalViewer({ size }: ViewerProps) {
  const [action, setAction] = useState<ControlAction>({ id: 0, kind: 'reset' })
  const [sceneReady, setSceneReady] = useState(false)
  const [webGLAvailable] = useState(() => supportsWebGL())
  const runControl = (kind: ControlKind) => setAction(current => ({ id: current.id + 1, kind }))
  const markReady = useMemo(() => () => setSceneReady(true), [])

  if (!webGLAvailable) return <StaticFallback size={size} />

  return <ViewerErrorBoundary key={size.id} fallback={<StaticFallback size={size} />}>
    <div className="storage-viewer architectural-viewer" id="size-visualisation" data-size={size.id} data-scene-ready={sceneReady}>
      <Canvas shadows camera={{ fov: 35, near: .04, far: 100 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.08; gl.outputColorSpace = THREE.SRGBColorSpace }}>
        <Suspense fallback={null}><ArchitectureScene size={size} action={action} onReady={markReady} /></Suspense>
      </Canvas>
      {!sceneReady && <div className="viewer-scene-loading"><span />Đang dựng không gian kho...</div>}
      <div className="viewer-badge"><span />Mô phỏng kiến trúc 3D</div>
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


