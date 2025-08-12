
const makeNodeMap = (treeData) => {
    console.log('here')
    let leafCount = 0
    const nodeMap = {}
    for (let n in treeData) {
        //console.log('n', n, treeData[n])
        if (treeData[n].is_tip) {
            leafCount += 1
        }
        if (treeData[n].parent_id == treeData[n].node_id) {
            console.log('root?', treeData[n])
        }
        //console.log('parent', treeData[n].parent_id)
        //console.log('lc', leafCount)

    }
    
        
    let root = null
    treeData.records.forEach (node => {
        if (node.parent_id == node.node_id) {
            root = node
        } else if (nodeMap[node.parent_id]) {
            nodeMap[node.parent_id].children.push(node)
        }

        
    })
    /*
    //check node map
    for (let n in nodeMap) {
        console.log('bet', n, nodeMap[n].name)  
        for (let c in nodeMap[n].children) {
            console.log('n', n, 'c', c, nodeMap[n].children[c].node_id)
        }
    }
    */  
   return {
        nodeMap,
        root,
        leafCount
    }
   

}



export function analyzeAutolin(data, keyStuff) {
  // Your analysis logic here
  console.log("Analyzing data:");
  //console.log("data keys:", Object.keys(data.base_data));
  //Object.entries(data).forEach(([key, value]) => {
    //console.log(key, ":", value);
  //});
  //console.log("data keys", Object.keys(data))
  //console.log("status", data.status)
  //console.log("base data", data.base_data)
  //Object.entries(data.base_data).forEach(([key, value]) => {
  //  console.log(key, ":", value);
  //});
  //console.log("Analyzing keyStuff:", keyStuff);
  // ...do your analysis...
  const { nodeMap, root, leafCount } = makeNodeMap(data.base_data.nodeLookup);
  console.log("Node Map:", nodeMap);
  console.log("Root Node:", root);
  console.log("Leaf Count:", leafCount);
}