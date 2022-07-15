import * as cf from './custom-functions'

export default class QueryEditor {

    constructor(container, ifcViewerAPI) {
        this.container = container
        this.viewer = ifcViewerAPI
    }

    /**
     * @description Takes a query string and returns all elements that 
     * met the criteria. You can pass any string that has the correct format to perform
     * a search, or you can also pass the returned value from the currentQueryString 
     * method.
    */
    search(modelID = 0, queryString = this.getQueryString()){

        if (queryString == "") {return}
        const model = this.viewer.context.items.ifcModels[modelID]
        let result = []

        try {
            
            const brokenQuery = queryString.split(/\(([^)]+)\)/) //Splits everything between parenthesis
            const queryGroups = []
            const queryOperators = ["OR"]

            for (let i=0; i<brokenQuery.length; i++) {
            if (brokenQuery[i] != "") {
                if (i % 2 == 0) {
                    queryOperators.push(brokenQuery[i].replace(/\s+/g, ''))
                } else {
                    queryGroups.push(brokenQuery[i])
                }
            }
            }

            queryGroups.forEach( (queryGroup, i) => {

            let groupResult = []

            const brokenGroup = queryGroup.split(/\[([^\]]+)\]/) //Splits everything between square brackets
            const groupSearches = []
            const groupOperators = ["OR"]

            for (let i=0; i<brokenGroup.length; i++) {
                if (brokenGroup[i] != "") {
                    if (i % 2 == 0) {
                        groupOperators.push(brokenGroup[i].replace(/\s+/g, ''))
                    } else {
                        groupSearches.push(brokenGroup[i])
                    }
                }
            }

            groupSearches.forEach( (search, i) => {
                
                const brokenSearch = search.split(/\'([^']+)\'/g)
                const property = brokenSearch[1]
                const operator = brokenSearch[2].replace(/\s+/g, '')
                const value = brokenSearch[3]
                const queryValues = model.modelData[property].values

                let localSearchResult = []
                for (const currentValue in queryValues) {
                    if (evalProperty(currentValue, operator, value) == true) {
                        localSearchResult = cf.arrayOperator(localSearchResult, queryValues[currentValue])["OR"]
                    }
                }

                groupResult = cf.arrayOperator(groupResult, localSearchResult)[groupOperators[i]]
                
            })

            result = cf.arrayOperator(result, groupResult)[queryOperators[i]]

            })

        } catch(error) {

            result = []

        }

        return result
    }

    /**
     * @description It does the same as the search method, it just applies it
     * to all models by default.
    */
    searchAll(queryString = this.getQueryString()){

        const ids = []
        this.viewer.context.items.ifcModels.forEach(model => {
            this.search(model.modelID, queryString).forEach(id => {
                ids.push(id)
            })
        })

        return ids

    }

    /**
     * @description This takes the current query inside the container and 
     * returns the string required to perform a querySearch.
    */
    getQueryString() {

        let queryString = ""

        const queryStringFunctions = {
            "queryEvaluation": (domElement) => {

                let localQueryString = ""
                const queryComponent = domElement.parentElement.getAttribute("data-queryComponent")
                
                if (queryComponent == "queryGroup"){
                    localQueryString += "["
                } else {
                    localQueryString += "(["
                }
                
                const evaluationChildren = Array.from(domElement.children)

                evaluationChildren.slice(1, evaluationChildren.length).forEach( (component, i) => {
                    if (i != 1) {
                        localQueryString += "'" + component.value + "'"
                    } else {
                        localQueryString += " " + component.value + " "
                    }
                } )
                
                
                if (queryComponent == "queryGroup"){
                    localQueryString += "]"
                } else {
                    localQueryString += "])"
                }

                queryString += localQueryString

            },
            "queryGroup": (domElement) => {

                queryString += "("
                const domElementChildren = Array.from(domElement.children)
                
                domElementChildren.forEach(child => {
            
                    if (child.getAttribute("data-queryComponent") != null) {
                        queryStringFunctions[child.getAttribute("data-queryComponent")](child)
                    }
                
                });

                queryString += ")"

            },
            "queryOperator": (domElement) => {

                queryString += " " + domElement.value + " "

            }
        }

        queryStringFunctions["queryGroup"](this.container)

        return queryString.replace(/\(\(+/g, '(').replace(/\)\)+/g, ')')

    }

    /**
     * @description Creates a query group (group of multiple queries) inside 
     * a given container. This returns the created dom element.
    */
    createGroup(){

        const queryGroup = document.createElement("div")
        queryGroup.className = "queryGroup"
        queryGroup.setAttribute("data-queryComponent", "queryGroup")
        this.container.append(queryGroup)
    
        const newRuleButton = document.createElement("button")
        newRuleButton.style.height = "40px"
        newRuleButton.innerHTML = "Add Rule"
        queryGroup.append(newRuleButton)
    
        newRuleButton.addEventListener("click", () => {
    
            const queryContainerLength = Array.from(queryGroup.children).length
            if (queryContainerLength > 1) {this.createOperator(queryGroup)}
            this.createEvaluator(queryGroup)            
        
        })
    
        this.createEvaluator(queryGroup)
    
        return queryGroup

    }

    /**
     * @description Creates a query evaluation inside a given container. This
     * returns the created dom element.
    */
    createEvaluator(container = this.container) {

        const model = this.viewer.context.items.ifcModels[0]
        
        const queryEvaluation = document.createElement("div")
        queryEvaluation.className = "queryEvaluation"
        queryEvaluation.setAttribute("data-queryComponent", "queryEvaluation")
        container.append(queryEvaluation)

        const dataList = document.createElement("datalist")
        dataList.setAttribute("data-queryComponent", "queryPossibleValues")
        const dataListId = Math.random().toString(36).slice(2)
        dataList.id = dataListId
    
        const propertySelector = document.createElement("select")
        cf.fillSelectTag(propertySelector, Object.keys(model.modelData))
        propertySelector.style.width = "100%"
        propertySelector.setAttribute("data-queryComponent", "queryProperty")
        propertySelector.addEventListener("change", () => {
            queryField.value = this.getQueryString()
            cf.removeAllChildNodes(dataList)
            cf.fillSelectTag(
                dataList, 
                Object.keys(model.modelData[propertySelector.value].values)
            );
        })
    
        const conditionSelector = document.createElement("select")
        conditionSelector.style.width = "100px"
        conditionSelector.setAttribute("data-queryComponent", "queryCondition")
        cf.fillSelectTag(conditionSelector, ["=", "!=", "sw", ">", ">=", "<", "<=", "."])
        conditionSelector.addEventListener("change", () => {
            queryField.value = this.getQueryString()
        })
    
        const valueInput = document.createElement("input")
        valueInput.style.width = "100%"
        valueInput.setAttribute("data-queryComponent", "queryValue")
        valueInput.setAttribute("list", dataListId)
        valueInput.addEventListener("keyup", () => {
            queryField.value = this.getQueryString()
        })
    
        queryEvaluation.append(dataList, propertySelector, conditionSelector, valueInput)
    
        return queryEvaluation

    }

    /**
     * @description Creates a query operator (AND/OR) inside a given container. This 
     * returns the created dom element.
    */
    createOperator(container = this.container) {

        const queryOperator = document.createElement("select")
        queryOperator.setAttribute("data-queryComponent", "queryOperator")
        queryOperator.style.height = "40px"
        cf.fillSelectTag(queryOperator, ["AND","OR"])
        container.append(queryOperator)
    
        return queryOperator

    }

}

/**
 * @description A foundation function that takes a property value, an operator 
 * and a comparison value to return if the criteria is met or not.
*/
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
            return propertyValue.startsWith(value)
        }
        
    }

    return operatorFunctions[operator]()

}