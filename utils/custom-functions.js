/**
 * @description This applies AND/OR operators on two input arrays. 
*/

export function arrayOperator (arrayA, arrayB, operator){

    return {
        "AND": arrayA.filter(x => arrayB.includes(x)),
        "OR": [...new Set([...arrayA, ...arrayB])]
    }

}

/**
 * @description Merge two objects
*/

export function mergeObjects(objects){

}

/**
 * @description Removes all child nodes from a given DOM Element
*/

export function removeAllChildNodes(parent) {
    while (parent.firstChild) {
        parent.removeChild(parent.firstChild);
    }
}

/**
 * @description Removes all duplicate values in a given list
*/

export function removeDuplicates(array) {
    return array.filter((item, index) => array.indexOf(item) === index);
}

/**
 * @description This function takes a DOM Element and adds new option tags
based on a given array. This is usefull to generate the possible
options of HTML select tags.
*/

export function fillSelectTag(domElement, list) {

    list.forEach(value => {
        const option = document.createElement("option")
        option.text = value
        option.value = value
        domElement.append(option)
    });

    return domElement

}

/**
 * @description Custom forEach made to handle promises
*/

export async function asyncForEach(array, callback){

    for (let index = 0; index < array.length; index++) {
        await callback(array[index], index, array)
    }

}