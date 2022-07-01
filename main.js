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

    viewer.IFC.loader.load( url, async (model) => {

        scene.add(model)
        ifcModels.push(model)
        model.modelData = {}
        await getModelProperties(model.modelID)
        fillSelectTag("propertiesList", Object.keys(model.modelData))
        
        viewer.context.fitToFrame()
        console.log("Model Loaded")

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
        //console.log(expressId)
        return

    }

    if ( intersect == null ) {

        viewer.IFC.selector.unpickIfcItems()
        return

    }

}

renderer.domElement.addEventListener( "mousemove", onMouseMove )

const propertiesSelector = document.getElementById("propertiesList");

const mat = new THREE.MeshLambertMaterial({
    transparent: true,
    opacity: 1,
    color: "CornflowerBlue",
    depthTest: true
})

/*propertiesSelector.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex].value
    createSubset(ifcModels[0].modelData[selectedOption].elements)
    //createSubset(ifcModels[0].modelData[selectedOption].values["M-1"])
})*/

//Handle user searches
const searchField = document.getElementById("searchField");
searchField.addEventListener("change", (e) => {
    createSubset(ifcModels[0].modelData[propertiesSelector.value].values[e.target.value])
})

//-------START CUSTOM BASIC FUNCTIONS

//Custom forEach to handle promises
async function asyncForEach(array, callback){

    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }

}

function removeDuplicates(array) {
    return array.filter((item,
        index) => array.indexOf(item) === index);
}

//-------END CUSTOM BASIC FUNCTIONS

async function getPsetProperties(pset){

    const properties = []

    await asyncForEach(pset.HasProperties, async property => {
        properties.push(await viewer.IFC.getProperties(0,property.value,true))
    })
    
    return properties

}

async function getElementPsetProperties(modelID, expressID){

    const properties = []
    const psets = await viewer.IFC.loader.ifcManager.getPropertySets(modelID, expressID, true)

    await asyncForEach(psets, async pset => {
        const psetProperties = await getPsetProperties(pset)
        psetProperties.forEach( property => {
            properties.push(property)
        });
    })

    return properties

}

async function getModelProperties(modelID) {
    
    const spatialStructure = await viewer.IFC.getSpatialStructure(modelID)
    const modelElements = []
    
    spatialStructure.children[0].children[0].children.forEach(storey => {
        storey.children.forEach(element => {
            modelElements.push(element.expressID)
        });
    })

    const testList = [2979, 2529]
    const modelData = {}

    await asyncForEach(modelElements, async expressID => {

        const psets = await viewer.IFC.loader.ifcManager.getPropertySets(modelID, expressID, true)
        //console.log(psets)

        psets.forEach(pset => {
            //console.log(pset.HasProperties)
            pset.HasProperties.forEach(property => {
                //console.log(property)
                const propertyName = property.Name.value
                const propertyValue = property.NominalValue.value

                if (propertyName in modelData) {
                    modelData[propertyName].elements.push(expressID)
                    if (propertyValue in modelData[propertyName].values) {
                        modelData[propertyName].values[propertyValue].push(expressID)
                    } else {
                        modelData[propertyName].values[propertyValue] = [expressID]
                    }
                } else {
                    modelData[propertyName] = { "elements": [], "values": {} }
                    modelData[propertyName].elements.push(expressID)
                    modelData[propertyName].values[propertyValue] = [expressID]
                }

            });
        });
    })

    ifcModels[modelID].modelData = modelData
    ifcModels[modelID].modelElements = modelElements

    return modelData
}

function fillSelectTag(domElementID, list) {

    const element = document.getElementById(domElementID);

    list.forEach(value => {
        const option = document.createElement("option");
        option.text = value;
        element.add(option);
    });

    return element

}

function createSubset (ids) {
    
    const subsetConfig = {
        modelID: 0,
        ids: ids,
        //material: viewer.IFC.selector.defSelectMat,
        material: mat,
        scene: scene,
        removePrevious: true
    }

    viewer.IFC.loader.ifcManager.subsets.createSubset(subsetConfig)

}