$(document).ready(function(){
	$('.knob').mousedown(function(){
		$('.drawerbox').toggleClass('close');
	});

	const container = document.getElementById('drawerbox');
	if (!container) return;

	// Canvas texture generator for faces
	function createFaceTexture(number) {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;
		const ctx = canvas.getContext('2d');

		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, 256, 256);

		ctx.strokeStyle = '#dddddd';
		ctx.lineWidth = 10;
		ctx.strokeRect(5, 5, 246, 246);

		ctx.fillStyle = '#111111';
		ctx.font = 'bold 130px Arial, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(number.toString(), 128, 128);

		return new THREE.CanvasTexture(canvas);
	}

	// 1. Scene & Top-Down Camera Setup
	const scene = new THREE.Scene();
	let width = container.clientWidth || 800;
	let height = container.clientHeight || 500;

	const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
	camera.position.set(0, 25, 0); 
	camera.lookAt(0, 0, 0);

	const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
	renderer.setSize(width, height);
	container.appendChild(renderer.domElement);

	scene.add(new THREE.AmbientLight(0xffffff, 0.7));
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
	directionalLight.position.set(0, 20, 5);
	scene.add(directionalLight);

	// 2. Physics World Setup
	const world = new CANNON.World();
	world.gravity.set(0, -30, 0);

	const diceRadius = 1.0;
	let wallLimitX, wallLimitZ;
	let walls = [];

	function updateBounds() {
		width = container.clientWidth;
		height = container.clientHeight;

		const vFOV = THREE.MathUtils.degToRad(camera.fov);
		const halfHeight = Math.tan(vFOV / 2) * camera.position.y;
		const halfWidth = halfHeight * camera.aspect;

		wallLimitX = halfWidth - diceRadius;
		wallLimitZ = halfHeight - diceRadius;

		walls.forEach(w => world.removeBody(w));
		walls = [];

		function addWall(x, y, z, rx, ry) {
			const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
			wall.position.set(x, y, z);
			wall.quaternion.setFromEuler(rx, ry, 0);
			world.addBody(wall);
			walls.push(wall);
		}

		addWall(0, 0, -wallLimitZ, 0, 0);            // Back wall
		addWall(0, 0, wallLimitZ, 0, Math.PI);       // Front wall
		addWall(-wallLimitX, 0, 0, 0, Math.PI / 2);  // Left wall
		addWall(wallLimitX, 0, 0, 0, -Math.PI / 2); // Right wall
	}

	const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
	floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
	world.addBody(floorBody);

	updateBounds();

	// 3. Polyhedral Geometry & Physics Generators
	let currentMesh = null;
	let currentBody = null;

	function createD10Geometry(radius) {
		const geom = new THREE.BufferGeometry();
		const vertices = [];
		const h = radius * 1.2;
		const r = radius;

		const top = [0, h, 0];
		const bottom = [0, -h, 0];
		const ring = [];

		for (let i = 0; i < 10; i++) {
			const angle = (i * Math.PI) / 5;
			const y = (i % 2 === 0) ? r * 0.3 : -r * 0.3;
			ring.push([r * Math.cos(angle), y, r * Math.sin(angle)]);
		}

		for (let i = 0; i < 10; i++) {
			const next = (i + 1) % 10;
			vertices.push(...top, ...ring[i], ...ring[next]);
			vertices.push(...bottom, ...ring[next], ...ring[i]);
		}

		geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
		geom.computeVertexNormals();
		return geom;
	}

	function buildPolyhedronData(type) {
		let geom;
		let numFaces = 6;

		switch (type) {
			case 'd4':
				geom = new THREE.TetrahedronGeometry(1.4);
				numFaces = 4;
				break;
			case 'd8':
				geom = new THREE.OctahedronGeometry(1.3);
				numFaces = 8;
				break;
			case 'd10':
				geom = createD10Geometry(1.2);
				numFaces = 10;
				break;
			case 'd12':
				geom = new THREE.DodecahedronGeometry(1.2);
				numFaces = 12;
				break;
			case 'd20':
				geom = new THREE.IcosahedronGeometry(1.2);
				numFaces = 20;
				break;
			case 'd6':
			default:
				geom = new THREE.BoxGeometry(1.4, 1.4, 1.4);
				numFaces = 6;
				break;
		}

		let mesh;
		if (type === 'd6') {
			const materials = [];
			for (let i = 1; i <= 6; i++) {
				materials.push(new THREE.MeshStandardMaterial({ map: createFaceTexture(i), roughness: 0.2 }));
			}
			mesh = new THREE.Mesh(geom, materials);
		} else if (type === 'd4') {
			// Specific multi-material group assignment for the 4 faces of a Tetrahedron
			geom.clearGroups();
			const materials = [];
			for (let i = 1; i <= 4; i++) {
				materials.push(new THREE.MeshStandardMaterial({ map: createFaceTexture(i), roughness: 0.2 }));
				geom.addGroup((i - 1) * 3, 3, i - 1);
			}
			mesh = new THREE.Mesh(geom, materials);
		} else {
			const tex = createFaceTexture(numFaces);
			const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.2 });
			mesh = new THREE.Mesh(geom, mat);
		}

		const posAttr = geom.attributes.position;
		const vertices = [];
		const faces = [];

		for (let i = 0; i < posAttr.count; i++) {
			vertices.push(new CANNON.Vec3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
		}

		for (let i = 0; i < posAttr.count; i += 3) {
			faces.push([i, i + 1, i + 2]);
		}

		const shape = new CANNON.ConvexPolyhedron(vertices, faces);
		const body = new CANNON.Body({
			mass: 1,
			shape: shape,
			position: new CANNON.Vec3(0, 2, 0)
		});

		return { mesh, body };
	}

	function spawnDie(type) {
		if (currentMesh) scene.remove(currentMesh);
		if (currentBody) world.removeBody(currentBody);

		const diceData = buildPolyhedronData(type);
		currentMesh = diceData.mesh;
		currentBody = diceData.body;

		scene.add(currentMesh);
		world.addBody(currentBody);
	}

	function respawnDice() {
		if (!currentBody || !currentMesh) return;
		currentBody.position.set(0, 3, 0);
		currentBody.velocity.set(0, 0, 0);
		currentBody.angularVelocity.set(0, 0, 0);
		currentBody.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, 0);
		currentMesh.visible = true;
	}

	spawnDie('d6');

	// 4. Mouse Velocity Tracking & Throw Mechanics
	let isDragging = false;
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();

	let lastPos = new THREE.Vector3();
	let dragVelocity = new THREE.Vector3();
	let lastTime = performance.now();

	function getPlaneIntersection(e) {
		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		const targetPoint = new THREE.Vector3();
		raycaster.ray.intersectPlane(dragPlane, targetPoint);
		return targetPoint;
	}

	window.addEventListener('pointerdown', (e) => {
		if (!currentMesh) return;
		const rect = renderer.domElement.getBoundingClientRect();
		mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObject(currentMesh);

		if (intersects.length > 0) {
			isDragging = true;
			currentBody.mass = 0; 
			currentBody.velocity.set(0, 0, 0);
			currentBody.angularVelocity.set(0, 0, 0);

			const point = getPlaneIntersection(e);
			lastPos.copy(point);
			lastTime = performance.now();
		}
	});

	window.addEventListener('pointermove', (e) => {
		if (!isDragging || !currentBody) return;

		const currentPos = getPlaneIntersection(e);
		const now = performance.now();
		const dt = (now - lastTime) / 1000;

		if (dt > 0) {
			dragVelocity.subVectors(currentPos, lastPos).divideScalar(dt);
		}

		lastPos.copy(currentPos);
		lastTime = now;

		currentBody.position.set(currentPos.x, 1.5, currentPos.z);
	});

	window.addEventListener('pointerup', () => {
		if (!isDragging || !currentBody) return;
		isDragging = false;

		const x = currentBody.position.x;
		const z = currentBody.position.z;

		if (Math.abs(x) > wallLimitX || Math.abs(z) > wallLimitZ) {
			currentMesh.visible = false;
			setTimeout(respawnDice, 300);
		} else {
			currentBody.mass = 1;
			currentBody.updateMassProperties();

			const throwFactor = 1.2;
			currentBody.velocity.set(
				dragVelocity.x * throwFactor,
				Math.min(Math.abs(dragVelocity.length()) * 0.8 + 2, 12),
				dragVelocity.z * throwFactor
			);

			currentBody.angularVelocity.set(
				dragVelocity.z * 3,
				(Math.random() - 0.5) * 10,
				-dragVelocity.x * 3
			);
		}
	});

	$('#spawnDiceBtn').click(function() {
		const selectedType = $('#diceTypeSelect').val();
		spawnDie(selectedType);
	});

	// 5. Animation Loop
	function animate() {
		requestAnimationFrame(animate);

		if (!isDragging) {
			world.step(1 / 60);
		}

		if (currentMesh && currentBody) {
			currentMesh.position.copy(currentBody.position);
			currentMesh.quaternion.copy(currentBody.quaternion);
		}

		renderer.render(scene, camera);
	}
	animate();

	window.addEventListener('resize', () => {
		if (!container) return;
		width = container.clientWidth;
		height = container.clientHeight;

		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);

		updateBounds();
	});
});