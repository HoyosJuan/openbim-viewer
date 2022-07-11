import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from "three"
import { IfcSelection } from 'web-ifc-viewer/dist/components'
import * as cf from './utils/custom-functions'
import QueryEditor from "./utils/query-sets"



const container = document.getElementById('viewer-container')
const viewer = window.viewer = new IfcViewerAPI({ 
    "container": container,
    "backgroundColor": new THREE.Color("lightgray")
})
const ifc = viewer.IFC.loader.ifcManager
//viewer.axes.setAxes()
//viewer.grid.setGrid(200,300)

const queryContainer = document.getElementById("queryContainer")
const queryEditor = new QueryEditor(queryContainer, viewer)

//Modify some of the web-ifc-viewer defaults
viewer.IFC.selector.defSelectMat.color = new THREE.Color("gold")
viewer.IFC.selector.defSelectMat.opacity = 0.25

//Store some viewer data in variables so it can be used easily later
const ifcModels = viewer.context.items.ifcModels
const scene = viewer.context.getScene()
const renderer = viewer.context.getRenderer()
renderer.setClearAlpha(1)
const raycaster = viewer.context.items.components[6].raycaster
const camera = viewer.context.getCamera()
const pointer = new THREE.Vector2()
const mat = new THREE.MeshLambertMaterial({
    transparent: true,
    opacity: 0.6,
    color: "CornflowerBlue",
    depthTest: false
})

const postProduction = viewer.context.renderer.postProduction
/*postProduction.tryToInitialize()
postProduction.addAntialiasPass()
postProduction.active = true
console.log(postProduction)*/

//Customize the viewer look
/*const grid = viewer.grid.grid
grid.material.color = {r: 0.8, g: 0.8, b: 0.8}
grid.material.transparent = true
grid.material.opacity = 0.15*/

function loadIFC(url, parseData = false) {

    viewer.IFC.loader.load( url, (model) => {

        scene.add(model)
        ifcModels.push(model)
        model.modelData = {}
        model.modelElements = {}
        if (parseData) {getModelProperties(model.modelID)}
        //fillSelectTag(propertiesList, Object.keys(model.modelData))
        
        //Add edges to the model
        const edgeMaterial = new THREE.LineBasicMaterial( { color: "Black"} )
        const edges = new THREE.EdgesGeometry( model.geometry );
        edgeMaterial.transparent = true
        edgeMaterial.opacity = 0.3
        const line = new THREE.LineSegments( edges, edgeMaterial )
        line.name = "ElementEdges"
        model.add( line )
        
        viewer.context.fitToFrame()

    })

}

//loadIFC("/IFC Files/SIMPLE-IFC.ifc")
loadIFC("/IFC Files/SRR-CGC-T01-ZZZ-M3D-EST-001.ifc")
//loadIFC("/IFC Files/NAV-IPI-ET1_E01-ZZZ-M3D-EST.ifc", true)

function onMouseMove (e) {

    pointer.x = ( (e.x - e.target.offsetLeft) / e.target.clientWidth ) * 2 - 1
    pointer.y = - ( (e.y - e.target.offsetTop) / e.target.clientHeight ) * 2 + 1
    raycaster.setFromCamera( pointer, camera )
    const intersect = raycaster.intersectObjects( ifcModels, false )[0]

    if ( intersect == null ) {

        viewer.IFC.selector.unpickIfcItems()
        return

    }

    const expressID = ifc.getExpressId(intersect.object.geometry, intersect.faceIndex)
    viewer.IFC.selector.pickIfcItemsByID(0,[expressID])

}

function onMouseClick (e) {

    pointer.x = ( (e.x - e.target.offsetLeft) / e.target.clientWidth ) * 2 - 1
    pointer.y = - ( (e.y - e.target.offsetTop) / e.target.clientHeight ) * 2 + 1
    raycaster.setFromCamera( pointer, camera )
    const intersect = raycaster.intersectObjects( ifcModels, false )[0]

    if ( intersect == null ) {

        viewer.IFC.selector.unpickIfcItems()
        return

    }

    const expressID = ifc.getExpressId(intersect.object.geometry, intersect.faceIndex)
    renderElementProperties(propertiesPanel,0,expressID)

}

renderer.domElement.addEventListener("mousemove", onMouseMove)
renderer.domElement.addEventListener("mouseup", onMouseClick)

async function getModelProperties(modelID = 0) {
    
    /*
    These are the two main variables that keep all the extracted data; 
    they are stored on its own key inside the viewer models data, so 
    they can be easily accessed everywhere.
    */
    const modelElements = ifcModels[modelID].modelElements = {}
    const modelData = ifcModels[modelID].modelData = {}
    
    //Main function to store a property 
    function storeProperty(elementExpressID, name, value, group) {

        //Logic for storing data inside modelData object
        if (name in modelData) {
            modelData[name].elements.push(elementExpressID)
            if (value in modelData[name].values) {
                modelData[name].values[value].push(elementExpressID)
            } else {
                modelData[name].values[value] = [elementExpressID]
            }
        } else {
            modelData[name] = { "elements": [], "values": {} }
            modelData[name].elements.push(elementExpressID)
            modelData[name].values[value] = [elementExpressID]
        }

        //Logic for storing data inside modelElements object
        if (!(elementExpressID in modelElements)) {
            modelElements[elementExpressID] = {}
        }
        modelElements[elementExpressID][name] = {}
        modelElements[elementExpressID][name].value = value
        modelElements[elementExpressID][name].group = group

    }

    //Functions for each type of ifc data
    const dataExtraction = {

        "IfcElementQuantity": (elementExpressID, quantitySet) => {
            quantitySet.Quantities.forEach( quantity => {
                const quantityType = quantity.constructor.name.replace(/IfcQuantity/,"")
                const propertyName = quantity.Name.value
                const propertyValue = quantity[`${quantityType + "Value"}`].value
                storeProperty(elementExpressID, propertyName, propertyValue, quantitySet.Name.value)
            })
        },

        "IfcPropertySet": (elementExpressID, propertySet) => {
            propertySet.HasProperties.forEach(property => {
                if (property.NominalValue == null) {return}
                const propertyName = property.Name.value
                const propertyValue = property.NominalValue.value
                storeProperty(elementExpressID, propertyName, propertyValue, propertySet.Name.value)
            });
        }

    }

    //Get all expressIDs of the model elements
    const spatialStructure = await viewer.IFC.getSpatialStructure(modelID)
    const buildingStoreys = spatialStructure.children[0].children[0].children
    const ids = []
    buildingStoreys.forEach(storey => {
        storey.children.forEach(element => {
            modelElements[element.expressID] = {}
            ids.push(element.expressID)
        });
    })

    //Process all element data regarding its property sets and quantity sets
    await cf.asyncForEach(ids, async expressID => {

        const psets = await ifc.getPropertySets(modelID, expressID, true)
        psets.forEach(pset => {
            dataExtraction[pset.constructor.name](expressID, pset)
        });

    })

    //Process basic element data such as its name, type, global id, etc...
    await cf.asyncForEach(ids, async expressID => {

        const dataToExtract = 
        ["GlobalId", "Name", "ObjectType", 
        "PredefinedType", "Tag"];

        const basicData = await ifc.getItemProperties(modelID, expressID, false)
        dataToExtract.forEach(data => {
            if (basicData[data] == null) {return}
            storeProperty(expressID, data, basicData[data].value, "General")
        });
        
        const ifcType = ifc.getIfcType(modelID, expressID)
        storeProperty(expressID, "IfcType", ifcType, "General")

    })

    return modelData
}

const parseDataButton = document.getElementById("parseData")
parseDataButton.addEventListener("click", async () => {
    await getModelProperties(0)
    console.log("Properties parsed!")
})

//------START QUERY SETS FUNCTIONALITY------
//------START QUERY SETS FUNCTIONALITY------
//------START QUERY SETS FUNCTIONALITY------

const testQuery = document.getElementById("testQuery")
const queryField = document.getElementById("queryField")

/*propertiesSelector.addEventListener("change", (e) => {
    removeAllChildNodes(searchFieldList)
    searchField.value = ""
    const possibleOptions = ifcModels[0].modelData[propertiesSelector.value].values
})*/

testQuery.addEventListener("click", (e) => {

    createQuerySet("Custom Query", queryEditor.getQueryString())

})

/**
 * @description Creates an IFC Selection class with the elements that met the criteria
 * of the given query string. It returns the new ifc selection.
*/
function createQuerySet(name, queryString) {

    const ids = queryEditor.search(queryString)
    if (ids == []) { return }
    const selectMat = new THREE.MeshLambertMaterial({
        transparent: true,
        opacity: 0.5,
        color: "Red",
        depthTest: true
    })
    const querySelection = new IfcSelection(viewer.context, viewer.IFC.loader, selectMat)
    querySelection.pickByID(0,ids,true,true)
    
    return querySelection

}

const addQueryRule = document.getElementById("addQueryRule")
addQueryRule.addEventListener("click", () => {

    if (Object.keys(ifcModels[0].modelData).length === 0) {
        console.log("Don't be idiot, you first need to parse all model data!")
        return
    }
    
    const queryContainerLength = Array.from(queryContainer.children).length
    if (queryContainerLength != 0) {queryEditor.createOperator(queryContainer)}
    queryEditor.createEvaluator()
    queryField.value = queryEditor.getQueryString()

})

const addQueryGroup = document.getElementById("addQueryGroup")
addQueryGroup.addEventListener("click", () => {

    if (Object.keys(ifcModels[0].modelData).length === 0) {
        console.log("Don't be idiot, you first need to parse all model data!")
        return
    }

    const queryContainerLength = Array.from(queryContainer.children).length
    if (queryContainerLength != 0) {queryEditor.createOperator(queryContainer)}
    queryEditor.createGroup()
    queryField.value = queryEditor.getQueryString()
    
})

//------END QUERY SETS FUNCTIONALITY------
//------END QUERY SETS FUNCTIONALITY------
//------END QUERY SETS FUNCTIONALITY------


//-----TESTING FUNCTIONALITIES
//-----TESTING FUNCTIONALITIES
//-----TESTING FUNCTIONALITIES

//Properties Panel
const propertiesPanel = document.getElementById("propertiesList")

function renderElementProperties(panel, modelID = 0, expressID) {
    
    cf.removeAllChildNodes(panel)
    const groups = {}
    const elementProperties = ifcModels[modelID].modelElements[expressID]

    for (let property in elementProperties) {

        const group = elementProperties[property].group
        const value = elementProperties[property].value

        if (!(group in groups)) {

            const propertyGroup = document.createElement("div")
            propertyGroup.className = "propertyGroup"
            propertyGroup.id = group
            
            const groupName = document.createElement("h4")
            groupName.textContent = group
            propertyGroup.append(groupName)

            panel.append(propertyGroup)
            groups[group] = propertyGroup

        }
        
        const propertyDOMElement = document.createElement("div")
        propertyDOMElement.className = "elementProperty"
        propertyDOMElement.textContent = `${property}: ${value}`
        groups[group].append(propertyDOMElement)

    }

}

//Clash Matrix
const clashMatrixConfig = {
    "disciplines": {
        "Arquitectura": [],
        "Estructura": [],
        "Red Mecánica": []
    },
    "checkGroups": [[true,false,false],[true,true,false],[true,true,true]]
}

//4D viewer
const createScheduleSets = document.getElementById("createScheduleSets")
const scheduleIds = []
createScheduleSets.addEventListener("click", () => {

    const scheduleQuerySets = 
    [
        "(['Nivel'.'1'] AND ['IfcType'.'BEAM'])",
        "(['Nivel'.'1'] AND ['IfcType'.'SLAB'])",
        "(['Nivel'.'1'] AND ['IfcType'.'WALL'])",
        "(['Nivel'.'2'] AND ['IfcType'.'SLAB'])",
        "(['Nivel'.'2'] AND ['IfcType'.'WALL'])",
        "(['Nivel'.'3'] AND ['IfcType'.'SLAB'])",
        "(['Nivel'.'3'] AND ['IfcType'.'WALL'])",
        "(['Nivel'.'4'] AND ['IfcType'.'SLAB'])",
        "(['Nivel'.'4'] AND ['IfcType'.'WALL'])",
        "(['Nivel'.'5'] AND ['IfcType'.'SLAB'])",
        "(['Nivel'.'5'] AND ['IfcType'.'WALL'])"
    ];

    scheduleQuerySets.forEach(queryString => {
        queryEditor.search(queryString).forEach(element => {
            scheduleIds.push(element)
        });
    });

    console.log("Schedule Sets Created")

})

const myRange = document.getElementById("myRange")
myRange.addEventListener("input", () => {
    
    viewer.IFC.selector.highlightIfcItemsByID(
        0,
        scheduleIds.slice(0,scheduleIds.length * myRange.value/100),
        false,
        true
    );

})



//viewer.clipper.createFromNormalAndCoplanarPoint(new THREE.Vector3(0,-1,0), new THREE.Vector3(0,3,0), false)

//-----TESTING FUNCTIONALITIES
//-----TESTING FUNCTIONALITIES
//-----TESTING FUNCTIONALITIES