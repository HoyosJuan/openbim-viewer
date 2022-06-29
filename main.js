import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from "three"

const container = document.getElementById('viewer-container')
const viewer = window.viewer = new IfcViewerAPI({ container })
const ifcModels = viewer.context.items.ifcModels
const scene = viewer.context.scene.scene
viewer.axes.setAxes()
viewer.grid.setGrid()

const input = document.getElementById("file-input")

/*input.addEventListener("change",

  async (changed) => {
   
    const file = changed.target.files[0];
    const ifcURL = URL.createObjectURL(file);
    viewer.IFC.loadIfcUrl(ifcURL, true);

  },
  false
)*/

function loadIFC( url ) {

    viewer.IFC.loader.load( url, (model) => {

        scene.add(model)
        ifcModels.push(model)

        const edges = new THREE.EdgesGeometry( model.geometry );
        const edgeMaterial = new THREE.LineBasicMaterial( { color: "Black"} )
        edgeMaterial.transparent = true
        edgeMaterial.opacity = 0.3
        const line = new THREE.LineSegments( edges, edgeMaterial )
        line.name = "ElementEdges"
        model.add( line )

    })

}

loadIFC("SRR-CGC-T01-ZZZ-M3D-EST-001.ifc")

//Customize the viewer look
const grid = viewer.grid.grid //Access the THREE.js grid element to manipulate it.
grid.material.color = {r: 0.8, g: 0.8, b: 0.8}
grid.material.transparent = true
grid.material.opacity = 0.15

const renderer = viewer.context.renderer.renderer
const raycaster = viewer.context.items.components[6].raycaster

function onMouseMove (e) {
    const intersect = raycaster.intersectObjects( ifcModels, false )[0]
    console.log(intersect)
}

renderer.domElement.addEventListener( "mousemove", onMouseMove )