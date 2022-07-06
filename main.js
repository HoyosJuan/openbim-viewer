import { IfcViewerAPI } from 'web-ifc-viewer'
import * as THREE from "three"
import { IfcSelection } from 'web-ifc-viewer/dist/components'
import { IfcDimensionLine } from 'web-ifc-viewer/dist/components/display/dimensions/dimension-line'

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
const mat = new THREE.MeshLambertMaterial({
    transparent: true,
    opacity: 1,
    color: "CornflowerBlue",
    depthTest: true
})

//Customize the viewer look
const grid = viewer.grid.grid
grid.material.color = {r: 0.8, g: 0.8, b: 0.8}
grid.material.transparent = true
grid.material.opacity = 0.15

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


//------START SEARCH FUNCTIONALITY

const propertiesSelector = document.getElementById("propertiesList")
const operatorsSelector = document.getElementById("operators")
const searchField = document.getElementById("searchField")
const searchFieldList = document.getElementById("searchFieldList")
const saveQuery = document.getElementById("saveQuery")

propertiesSelector.addEventListener("change", (e) => {
    removeAllChildNodes(searchFieldList)
    searchField.value = ""
    const possibleOptions = ifcModels[0].modelData[propertiesSelector.value].values
    for (value in possibleOptions) {
        const option = document.createElement("option");
        option.text = value;
        searchFieldList.append(option);
    }
})

saveQuery.addEventListener("click", (e) => {
    
    //if (searchField.value == "") {return}
    //const ids = querySearch("(['Nivel' . '1'] and ['Marca' = 'M-2']) or (['Nivel' . '2'])")
    //const ids = querySearch("(['Nivel' = 'Nivel 1'])")
    const ids = querySearch("(['Nivel' . '1'] or ['Nivel' . '2'])")
    if (ids == []) {return}
    const querySelection = new IfcSelection(viewer.context, viewer.IFC.loader, mat)
    querySelection.newSelection(0, ids, true)
    /*querySelection.type = "custom"
    querySelection.name = "Nivel 01"*/
})

//------END SEARCH FUNCTIONALITY


//-------START CUSTOM BASIC FUNCTIONS

//Custom forEach to handle promises
async function asyncForEach(array, callback){

    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }

}

//Remove all duplicate values in a given list
function removeDuplicates(array) {
    return array.filter((item,
        index) => array.indexOf(item) === index);
}

//Remove all child nodes from a given DOM Element
function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}

//Merge two objects (for merge models data for example)
function mergeObjects(objects){

}

//Returns the intersection of two arrays
function arrayOperator (arrayA, arrayB, operator){

    if (operator == "and") {return arrayA.filter(x => arrayB.includes(x))}
    if (operator == "or") {return [...new Set([...arrayA, ...arrayB])]}

}

function arrayEvenOdd(array) {

    const oddOnes = []
    const evenOnes = []

    for (var i=0; i<array.length; i++) {
        (i % 2 == 0 ? evenOnes : oddOnes).push(array[i])
    }

    return [evenOnes, oddOnes]

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
        element.append(option);
    });

    return element

}

function querySearch(query) {
    
    let result = []
    
    const brokenQuery = query.split(/\(([^)]+)\)/) //Splits everything between parenthesis
    const queryGroups = []
    const queryOperators = ["or"]

    for (let i=0; i<brokenQuery.length; i++) {
        if (brokenQuery[i] != "") {
            if (i % 2 == 0) {
                queryOperators.push(brokenQuery[i].replace(/\s+/g, ''))
            } else {
                queryGroups.push(brokenQuery[i])
            }
        }
    }

    //console.log(queryGroups)
    //console.log(queryOperators)

    queryGroups.forEach( (queryGroup, i) => {
        
        let groupResult = []

        const brokenGroup = queryGroup.split(/\[([^\]]+)\]/) //Splits everything between square brackets
        const groupSearches = []
        const groupOperators = ["or"]

        for (let i=0; i<brokenGroup.length; i++) {
            if (brokenGroup[i] != "") {
                if (i % 2 == 0) {
                    groupOperators.push(brokenGroup[i].replace(/\s+/g, ''))
                } else {
                    groupSearches.push(brokenGroup[i])
                }
            }
        }

        //console.log(groupSearches)
        //console.log(groupOperators)
        
        groupSearches.forEach( (search, i) => {
            
            const brokenSearch = search.split(/\'([^']+)\'/g)
            const property = brokenSearch[1]
            const operator = brokenSearch[2].replace(/\s+/g, '')
            const value = brokenSearch[3]
            const queryValues = ifcModels[0].modelData[property].values

            let localSearchResult = []
            for (const currentValue in queryValues) {
                if (evalProperty(currentValue, operator, value) == true) {
                    localSearchResult = arrayOperator(localSearchResult, queryValues[currentValue], "or")
                }
            }

            groupResult = arrayOperator(groupResult, localSearchResult, groupOperators[i])
            
        })

        result = arrayOperator(result, groupResult, queryOperators[i])

    })

    return result

}

function evalProperty(propertyValue, operator, value){

    const operatorFunctions = {
        "=": function equals() {
            return propertyValue == value
        },
        "!=": function notEqual(){
            return propertyValue != value
        },
        ".": function contains(){
            return propertyValue.includes(value)
        },
        ">": function greater(){
            return propertyValue > value
        },
        ">=": function greaterEqual(){
            return propertyValue >= value
        },
        "<": function less(){
            return propertyValue < value
        },
        "<=": function lessEqual(){
            return propertyValue <= value
        },
        "sw": function startsWith(){
            return
        }
    }

    return operatorFunctions[operator]()

}

//-----TESTING FUNCTIONALITIES

//viewer.clipper.createFromNormalAndCoplanarPoint(new THREE.Vector3(0,-1,0), new THREE.Vector3(0,3,0), false)

//-----TESTING FUNCTIONALITIES