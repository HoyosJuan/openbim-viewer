import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from "three"
import { IfcSelection } from 'web-ifc-viewer/dist/components'
import * as cf from './utils/custom-functions'
import QueryEditor from "./utils/query-sets"

const container = document.getElementById('viewer-container')
const viewer = window.viewer = new IfcViewerAPI({ "container": container })
viewer.IFC.applyWebIfcConfig({ COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true });
const ifc = viewer.IFC.loader.ifcManager
viewer.clipper.active = true
//await ifc.useWebWorkers(true, "IFCWorker.js")

const queryContainer = document.getElementById("queryContainer")
const queryEditor = new QueryEditor(queryContainer, viewer)

//Modify some of the web-ifc-viewer defaults
viewer.IFC.selector.defSelectMat.color = new THREE.Color("gold")
viewer.IFC.selector.defSelectMat.opacity = 0.25

//Store some viewer data in variables so it can be used easily later
const ifcModels = viewer.context.items.ifcModels
const scene = viewer.context.getScene()
const renderer = viewer.context.getRenderer()
const raycaster = viewer.context.ifcCaster.raycaster
raycaster.firstHitOnly = true
const camera = viewer.context.getCamera()
const pointer = viewer.context.mouse.position
const cssColors = ["DarkCyan", "DarkOrange", "LightCoral", "LighGreen", "MediumOrchid"]
const mat = new THREE.MeshLambertMaterial({
    transparent: true,
    opacity: 0.8,
    color: "MediumAquaMarine",
    //color: cssColors[Math.floor(Math.random()*cssColors.length)],
    depthTest: true
})

async function loadIFC(url, getData = false) {

    viewer.IFC.loader.load( url, (model) => {

        ifcModels.push(model)
        scene.add(model)
        model.modelData = {}
        model.modelElements = {}
        if (getData) {getModelProperties(model.modelID)}
        
        //Add edges to the model
        const edgeMaterial = new THREE.LineBasicMaterial( { color: "Black"} )
        const edges = new THREE.EdgesGeometry( model.geometry );
        edgeMaterial.transparent = true
        edgeMaterial.opacity = 0.3
        const line = new THREE.LineSegments( edges, edgeMaterial )
        line.name = "ElementEdges"
        model.add( line )
        
        viewer.context.fitToFrame()

        console.log("Model loaded!")

    })

}

//await loadIFC("/IFC Files/HNSAI_BPY_M3_ARQ_HABITACIONES.ifc")
//await loadIFC("/IFC Files/NAV-FLUX-ET1-E01-ZZZ-M3D-INH.ifc")
//await loadIFC("/IFC Files/NAV-BSKA-ETG_URB-ZZZ-M3D-ARQ.ifc")
//await loadIFC("/IFC Files/HNSAI_BPY_M3_HVAC.ifc", true)
await loadIFC("/IFC Files/SRR-CGC-T01-ZZZ-M3D-EST-001.ifc", true)
//await loadIFC("/IFC Files/SRR-CGC-T02-ZZZ-M3D-EST-001.ifc")
//loadIFC("/IFC Files/SIMPLE-IFC.ifc")
//loadIFC("/IFC Files/NAV-IPI-ET1_E01-ZZZ-M3D-EST.ifc")

function onMouseMove (e) {

    raycaster.setFromCamera( pointer, camera )
    const intersect = raycaster.intersectObjects( ifcModels, false )[0]
    
    if ( intersect == null ) {

        viewer.IFC.selector.unpickIfcItems()
        return

    }
    
    const modelID = intersect.object.modelID
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

async function getModelProperties(modelID = 0, callback = () => {}, getPsets = false) {
    
    //Returns the function if no model is loaded.
    if (ifcModels.length == 0) { return }
    
    /*
    These are the two main variables that keep all the extracted data; 
    they are stored on its own key inside the viewer models data, so 
    they can be easily accessed everywhere.
    */
    const modelElements = ifcModels[modelID].modelElements = {}
    const modelData = ifcModels[modelID].modelData = {}
    
    //Main function to store a property 
    function storeProperty(expressID, name, value, group) {

        if (value == "") {value = "---"}

        //Logic for storing data inside modelData object
        if (name in modelData) {
            modelData[name].elements.push(expressID)
            if (value in modelData[name].values) {
                modelData[name].values[value].push(expressID)
            } else {
                modelData[name].values[value] = [expressID]
            }
        } else {
            modelData[name] = { "elements": [], "values": {} }
            modelData[name].elements.push(expressID)
            modelData[name].values[value] = [expressID]
        }

        //Logic for storing data inside modelElements object
        if (!(expressID in modelElements)) {
            modelElements[expressID] = {}
        }
        modelElements[expressID][name] = {}
        modelElements[expressID][name].value = value
        modelElements[expressID][name].group = group

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

    await cf.asyncForEach(buildingStoreys, async storey => {
        const storeyData = await ifc.getItemProperties(modelID, storey.expressID)
        const storeyName = storeyData.Name.value
        storey.children.forEach(element => {
            modelElements[element.expressID] = {}
            storeProperty(element.expressID, "Storey Name", storeyName, "Instance Properties")
            ids.push(element.expressID)
        });
    })
    
    let processCount = 0

    //Process all element data
    await cf.asyncForEach(ids, async expressID => {

        if (getPsets) {

            const psets = await ifc.getPropertySets(modelID, expressID, true)
            psets.forEach(pset => {
                dataExtraction[pset.constructor.name](expressID, pset)
            });

        }

        const dataToExtract = 
        ["Name", "ObjectType", 
        "PredefinedType", "Tag", "GlobalId"];

        const basicData = await ifc.getItemProperties(modelID, expressID, false)
        dataToExtract.forEach(data => {
            if (basicData[data] == null) {return}
            storeProperty(expressID, data, basicData[data].value, "Instance Properties")
        });
        
        const ifcType = ifc.getIfcType(modelID, expressID)
        storeProperty(expressID, "IfcType", ifcType, "Instance Properties")
        storeProperty(expressID, "expressID", expressID, "Instance Properties")

        const ifcBuilding = await viewer.IFC.getAllItemsOfType(modelID, 4031249490, true)
        const ifcBuildingName = ifcBuilding[0].Name.value
        storeProperty(expressID, "IfcBuildingName", ifcBuildingName, "Building Properties")

        processCount += 1
        callback(processCount/ids.length)

    })

    return modelData
}

const parseDataButton = document.getElementById("parseData")
parseDataButton.addEventListener("click", async () => {
    await getModelProperties(0, (processing) => {console.log(processing)}, true)
    //await getModelProperties(1)
})

//------START QUERY SETS FUNCTIONALITY------
//------START QUERY SETS FUNCTIONALITY------
//------START QUERY SETS FUNCTIONALITY------

const testQuery = document.getElementById("testQuery")
const queryField = document.getElementById("queryField")

testQuery.addEventListener("click", (e) => {

    createQuerySet("Custom Query", queryEditor.getQueryString())    

})

/**
 * @description Creates an IFC Selection class with the elements that met the criteria
 * of the given query string. It returns the new ifc selection.
*/
function createQuerySet(name, queryString) {

    const ids = queryEditor.search(queryString)
    if (ids.length == 0) { return }
    const querySelection = new IfcSelection(viewer.context, viewer.IFC.loader, mat)
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
    if (queryContainerLength != 0) {queryEditor.createOperator()}
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
    if (queryContainerLength != 0) {queryEditor.createOperator()}
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
        
        const propertyElement = document.createElement("div")
        propertyElement.className = "elementProperty"
        const propertyNameElement = document.createElement("p")
        propertyNameElement.textContent = property
        propertyNameElement.style.color = "#A5A4A4"
        propertyNameElement.style.fontSize = "14px"
        const propertyValueElement = document.createElement("p")
        propertyValueElement.textContent = value
        propertyElement.append(propertyNameElement, propertyValueElement)
        groups[group].append(propertyElement)

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
const myRange = document.getElementById("myRange")
const scheduleIds = []
createScheduleSets.addEventListener("click", () => {

    /*const scheduleQuerySets = 
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
    ];*/

    const scheduleQuerySets = 
    [
        "(['Nivel'.'1'])",
        "(['Nivel'.'2'])",
        "(['Nivel'.'3'])",
        "(['Nivel'.'4'])",
        "(['Nivel'.'5'])"
    ];

    scheduleQuerySets.forEach(queryString => {
        queryEditor.search(queryString).forEach(element => {
            scheduleIds.push(element)
        });
    });

    console.log("Schedule Sets Created")
    
})

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