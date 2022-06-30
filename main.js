import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from "three"

const container = document.getElementById('viewer-container')
const viewer = window.viewer = new IfcViewerAPI({ 
    "container": container,
    "backgroundColor": new THREE.Color("lightgray")
})
const ifc = viewer.IFC.loader.ifcManager
viewer.axes.setAxes()
viewer.grid.setGrid(200,300)

//Modify some of the web-ifc-viewer defaults
viewer.IFC.selector.defSelectMat.color = new THREE.Color("gold")
viewer.IFC.selector.defSelectMat.opacity = 0.25

//Store some viewer data in variables so it can be used easily later
const ifcModels = viewer.context.items.ifcModels
const scene = viewer.context.getScene()
const renderer = viewer.context.getRenderer()
const raycaster = viewer.context.items.components[6].raycaster
const camera = viewer.context.getCamera()
const pointer = new THREE.Vector2()

//Customize the viewer look
const grid = viewer.grid.grid //Access the THREE.js grid element to manipulate it.
grid.material.color = {r: 0.8, g: 0.8, b: 0.8}
grid.material.transparent = true
grid.material.opacity = 0.15

/*//Let the user select its own files
const input = document.getElementById("file-input")
input.addEventListener("change",

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

function onMouseMove (e) {

    pointer.x = ( (e.x - e.target.offsetLeft) / e.target.clientWidth ) * 2 - 1
    pointer.y = - ( (e.y - e.target.offsetTop) / e.target.clientHeight ) * 2 + 1
    raycaster.setFromCamera( pointer, camera )
    const intersect = raycaster.intersectObjects( ifcModels, false )[0]

    if ( intersect ) {

        const expressId = ifc.getExpressId(intersect.object.geometry, intersect.faceIndex)
        viewer.IFC.selector.pickIfcItemsByID(0,[expressId])
        console.log(expressId)
        return

    }

    if ( intersect == null ) {

        viewer.IFC.selector.unpickIfcItems()
        return

    }

}

renderer.domElement.addEventListener( "mousemove", onMouseMove )

const button = document.getElementById('properties')
button.addEventListener("click", async () => console.log(await hasProperty(0,2979)) )

//Custom forEach to handle promises
async function asyncForEach(array, callback){

    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }

}

async function getPropertySets(modelId, expressId){
    
    const psets = []
    const elementData = await viewer.IFC.getProperties(modelId,expressId,true)

    elementData.psets.forEach(pset => {

        psets.push(pset)

    });

    return psets

}

async function getPsetProperties(pset){

    const properties = []

    await asyncForEach(pset.HasProperties, async property => {
        properties.push(await viewer.IFC.getProperties(0,property.value,true))
    })
    
    return properties

}

async function getElementPsetProperties(modelId, expressId){

    const properties = []
    const psets = await getPropertySets(modelId, expressId)

    await asyncForEach(psets, async pset => {
        const psetProperties = await getPsetProperties(pset)
        psetProperties.forEach( property => {
            properties.push(property)
        });
    })

    return properties

}

async function evalProperty(ifcProperty, leftSide, condition, rightSide){

    let test = false 
    if (ifcProperty.Name.value == rightSide) {
     
        test = true

    }

    return test

}

async function hasProperty(modelId, expressId){

    const properties = await getElementPsetProperties(modelId, expressId)
    let test = false

    await asyncForEach(properties, async property => {
        if (await evalProperty(property, "", "", "Longitud") == true) {
            test = true
        }
    })

    return test

}