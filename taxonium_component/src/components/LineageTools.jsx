import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "./Basic";
import { FaCheck, FaChevronRight, FaChevronDown, FaList, FaStream, FaFilter } from "react-icons/fa";
import { 
  organizeLineageHierarchy, 
  generatePangoLineageColor,
  isPangoLineage,
  isDirectChild,
  parseLineageName,
  extractLineageRoot
} from "../utils/lineageUtils";
import LineageTimeChart from "./LineageTimeChart";

// Create a deep comparator for memoization to avoid unnecessary re-renders
const arePropsEqual = (prevProps, nextProps) => {
  // Always re-render if visibility changes
  if (prevProps.isVisible !== nextProps.isVisible) return false;
  
  // Always re-render if selected category changes
  if (prevProps.selectedCategory !== nextProps.selectedCategory) return false;
  
  // Check if colorByField has changed
  if (prevProps.colorByField !== nextProps.colorByField) return false;
  
  // For keyStuff, check if the reference has changed
  // This ensures we process new data when it's available
  if (prevProps.keyStuff !== nextProps.keyStuff) return false;
  
  // If we get here, props are considered equal
  return true;
};

// Use React.memo with custom comparator to prevent unnecessary re-renders
const LineageTools = React.memo(({ 
  keyStuff, 
  colorHook, 
  colorByField, 
  onCategorySelect, 
  selectedCategory,
  isPangoLineageField = false,
  toggleSidebar,
  isVisible,
  data,
  xType
}) => {
  //const [sortedItems, setSortedItems] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    try {
      const savedViewMode = localStorage.getItem('taxonium_lineage_view_mode');
      return savedViewMode || "hierarchical";
    } catch (e) {
      return "hierarchical";
    }
  });
  //const [hierarchyData, setHierarchyData] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [useHierarchicalColors, setUseHierarchicalColors] = useState(() => {
    try {
      const savedColorMode = localStorage.getItem('taxonium_hierarchical_colors');
      // Default to true if not set previously
      return savedColorMode ? JSON.parse(savedColorMode) : true;
    } catch (e) {
      return true;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const savedTab = localStorage.getItem('taxonium_lineage_active_tab');
      return savedTab || "lineages";
    } catch (e) {
      return "lineages";
    }
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [histogramBins, setHistogramBins] = useState(5);
  const [processedData, setProcessedData] = useState({
    lastKeyStuff: null,
    sortedItems: [],
    hierarchyData: []
  });
  
  // Use a more robust way to track if we're ready to process data
  const [dataProcessingState, setDataProcessingState] = useState({
    isProcessing: false,
    lastProcessedLength: 0,
    processingTimestamp: 0
  });

  const [autolinGenerated, setAutolinGenerated] = useState(false);
  
  // Add state for chart depth control
  const [maxChartDepth, setMaxChartDepth] = useState(3);

  // Process data with debouncing to prevent rapid updates
  
  const { sortedItems, hierarchyData } = useMemo(() => {
    if (!keyStuff || keyStuff.length === 0) {
      //setIsLoading(false);
      return { sortedItems: [], hierarchyData: [] };
    }
    
    //setIsLoading(true);
    
    const sorted = [...keyStuff].sort((a, b) => b.count - a.count);
    const hierarchy = organizeLineageHierarchy(keyStuff);
    
    //setIsLoading(false);
    
    return { sortedItems: sorted, hierarchyData: hierarchy };
  }, [keyStuff?.length]); // Only recompute if length changes

  
  // Store expanded items in localStorage to persist between renders
  useEffect(() => {
    try {
      // Load expanded items from localStorage on mount
      const storedItems = localStorage.getItem('taxonium_expanded_items');
      if (storedItems) {
        setExpandedItems(JSON.parse(storedItems));
      }
    } catch (e) {
      console.error("Error loading expanded items from localStorage:", e);
    }
  }, []);

  // Save expanded items to localStorage when changed
  useEffect(() => {
    try {
      if (Object.keys(expandedItems).length > 0) {
        localStorage.setItem('taxonium_expanded_items', JSON.stringify(expandedItems));
      }
    } catch (e) {
      console.error("Error saving expanded items to localStorage:", e);
    }
  }, [expandedItems]);
  
  // Save view mode to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('taxonium_lineage_view_mode', viewMode);
    } catch (e) {
      console.error("Error saving view mode to localStorage:", e);
    }
  }, [viewMode]);
  
  // Save color mode to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('taxonium_hierarchical_colors', JSON.stringify(useHierarchicalColors));
    } catch (e) {
      console.error("Error saving color mode to localStorage:", e);
    }
  }, [useHierarchicalColors]);
  
  // Save active tab to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('taxonium_lineage_active_tab', activeTab);
    } catch (e) {
      console.error("Error saving active tab to localStorage:", e);
    }
  }, [activeTab]);

  // Handle category selection with useCallback for better memoization
  const handleCategoryClick = useCallback((category) => {
    const newSelectedValue = category === selectedCategory ? null : category;
    onCategorySelect(newSelectedValue);
  }, [onCategorySelect, selectedCategory]);

  // Reset selected category
  const handleReset = useCallback(() => {
    onCategorySelect(null);
  }, [onCategorySelect]);
  
  // Toggle expand/collapse of a lineage
  const toggleExpand = useCallback((lineageName, e) => {
    e.stopPropagation();
    setExpandedItems(prev => ({
      ...prev,
      [lineageName]: !prev[lineageName]
    }));
  }, []);
  
  // Calculate total counts for percentages
  const totalCounts = useMemo(() => {
    const allItemsTotal = sortedItems.reduce((sum, item) => sum + (item.count || 0), 0);
    const hierarchyTotal = hierarchyData.reduce((sum, lineage) => sum + (lineage.count || 0), 0);
    return {
      allItems: allItemsTotal,
      hierarchy: hierarchyTotal
    };
  }, [sortedItems, hierarchyData]);
  
  // Get color for lineage, using hierarchical colors if enabled
  const getLineageColor = useCallback((lineageName) => {
    if (useHierarchicalColors && isPangoLineage(lineageName)) {
      return generatePangoLineageColor(lineageName);
    }
    
    // Find in keyStuff
    const item = keyStuff?.find(item => item.value === lineageName);
    return item?.color || [100, 100, 100];
  }, [keyStuff, useHierarchicalColors]);

  // Function to check if a lineage is part of another lineage's hierarchy
  // Returns: 'self' if exact match, 'parent' if lineage is parent, 'child' if lineage is child, null if unrelated
  const checkLineageRelationship = useCallback((lineageName, referenceLineage) => {
    if (!lineageName || !referenceLineage) return null;
    
    // Exact match
    if (lineageName === referenceLineage) return 'self';
    
    // Determine if node is in a highlighted lineage
    // This function is used to check if a node should be highlighted when a lineage is selected
    // When we select "AY", we want to highlight all nodes in "AY", "AY.4", "AY.4.2", etc.
    
    // Check if the lineage is a sub-lineage of the reference
    // For example, if reference is "AY", then "AY.4" and "AY.4.2" are sub-lineages
    if (lineageName.startsWith(referenceLineage + '.')) {
      return 'child'; // Node is a sub-lineage of the selected lineage
    }
    
    // Check if the reference is a sub-lineage of this lineage
    // For example, if lineage is "AY" and reference is "AY.4", then lineage is a parent
    if (referenceLineage.startsWith(lineageName + '.')) {
      return 'parent'; // Node is a parent of the selected lineage
    }
    
    // If nothing matched, they're unrelated
    return null;
  }, []);

  // Memoize hierarchical rendering to improve performance
  const renderHierarchicalItems = useMemo(() => {
    // Recursive function to render a node and its children
    const renderNode = (node, level = 0) => {
      // Early return for null nodes
      if (!node || !node.name) return null;
      
      const isExpanded = expandedItems[node.name] || false;
      const hasChildren = node.children && node.children.length > 0;
      const nodeColor = useHierarchicalColors 
        ? getLineageColor(node.name)
        : node.color;
      
      // Show both direct count and total count that includes children
      const directCount = node.originalCount || 0;
      const totalCount = node.count || 0;
      const hasDirectSamples = directCount > 0;
      
      // Filter by search term if one exists
      if (searchTerm && !node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        // If this node doesn't match but has children that might match, still render
        if (hasChildren) {
          const matchingChildren = node.children
            .map(child => renderNode(child, level + 1))
            .filter(Boolean);
          
          if (matchingChildren.length === 0) return null;
          
          // If there are matching children, render a collapsed version of this node
          return (
            <React.Fragment key={node.name}>
              <li 
                className="text-sm cursor-pointer py-1 px-1 flex justify-between rounded bg-gray-50"
                onClick={() => handleCategoryClick(node.name)}
                style={{ paddingLeft: `${(level * 10) + 8}px` }}
              >
                <div className="flex items-center flex-grow">
                  <button 
                    onClick={(e) => toggleExpand(node.name, e)}
                    className="mr-1 focus:outline-none"
                  >
                    {isExpanded ? 
                      <FaChevronDown className="text-gray-500 w-3 h-3" /> : 
                      <FaChevronRight className="text-gray-500 w-3 h-3" />
                    }
                  </button>
                  <span 
                    className="inline-block w-3 h-3 mr-2 rounded-full"
                    style={{ backgroundColor: `rgb(${nodeColor.join(',')})` }}
                  />
                  <span className="mr-2 text-gray-400 italic">
                    {node.name} <span className="text-gray-500">({matchingChildren.length} matches below)</span>
                  </span>
                </div>
              </li>
              
              {isExpanded && (
                <ul className="ml-0">
                  {matchingChildren}
                </ul>
              )}
            </React.Fragment>
          );
        } else {
          return null;
        }
      }
      
      const isSelected = selectedCategory === node.name;
      const relationship = checkLineageRelationship(node.name, selectedCategory);
      
      return (
        <React.Fragment key={node.name}>
          <li 
            className={`text-sm cursor-pointer py-1 px-1 flex justify-between rounded ${
              relationship === 'self' ? "bg-blue-100 font-medium" : 
              relationship === 'parent' ? "bg-blue-50" :
              relationship === 'child' ? "bg-indigo-50" :
              "hover:bg-gray-100"
            }`}
            onClick={() => handleCategoryClick(node.name)}
            style={{ paddingLeft: `${(level * 10) + 8}px` }}
          >
            <div 
              className="flex items-center flex-grow"
              style={{ 
                maxWidth: "65%", 
                overflow: "hidden", 
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {hasChildren ? (
                <button 
                  onClick={(e) => toggleExpand(node.name, e)}
                  className="mr-1 focus:outline-none"
                >
                  {isExpanded ? 
                    <FaChevronDown className="text-gray-500 w-3 h-3" /> : 
                    <FaChevronRight className="text-gray-500 w-3 h-3" />
                  }
                </button>
              ) : (
                <span className="w-3 mr-1"></span>
              )}
              
              <span 
                className={`inline-block w-3 h-3 mr-2 rounded-full ${
                  relationship === 'self' ? "ring-2 ring-blue-400" :
                  relationship === 'parent' ? "ring-1 ring-blue-300" : 
                  relationship === 'child' ? "ring-1 ring-indigo-300" : ""
                }`}
                style={{ backgroundColor: `rgb(${nodeColor.join(',')})` }}
              />
              
              <span className="mr-2 truncate">
                {node.name}
                {relationship === 'self' && (
                  <FaCheck className="ml-1 text-blue-600 inline-block" size={10} />
                )}
              </span>
            </div>
            
            {/* Display count information */}
            <div className="flex items-center text-xs">
              {hasDirectSamples && hasChildren && (
                <>
                  <div className="bg-blue-50 px-1.5 py-0.5 rounded-l text-blue-700 border border-r-0 border-blue-100" title="Direct samples with this exact lineage">
                    {directCount.toLocaleString()}
                  </div>
                  <div className="bg-gray-50 px-1.5 py-0.5 rounded-r text-gray-700 border border-gray-200" title="Total including all child lineages">
                    {totalCount.toLocaleString()}
                  </div>
                </>
              )}
              {hasDirectSamples && !hasChildren && (
                <span className="text-gray-600 tabular-nums">{directCount.toLocaleString()}</span>
              )}
              {!hasDirectSamples && (
                <span className="text-gray-500 tabular-nums">{totalCount.toLocaleString()}</span>
              )}
            </div>
          </li>
          
          {isExpanded && hasChildren && (
            <ul className="ml-0">
              {node.children.map(child => renderNode(child, level + 1))}
            </ul>
          )}
        </React.Fragment>
      );
    };
    
    return hierarchyData.map(node => renderNode(node));
  }, [hierarchyData, expandedItems, searchTerm, selectedCategory, useHierarchicalColors, getLineageColor, handleCategoryClick, toggleExpand, checkLineageRelationship]);
  
  // Check if we have Pango lineages to determine if hierarchical view makes sense
  const hasPangoLineages = useMemo(() => 
    isPangoLineageField || (keyStuff && keyStuff.some(item => isPangoLineage(item.value)))
  , [keyStuff, isPangoLineageField]);
  
  // Filter items by search term
  const filteredItems = useMemo(() => 
    searchTerm && sortedItems
      ? sortedItems.filter(item => item.value && item.value.toLowerCase().includes(searchTerm.toLowerCase()))
      : sortedItems || []
  , [searchTerm, sortedItems]);

  // CSS classes for panel visibility
  const containerClasses = `h-full flex flex-col bg-white border-r w-64 overflow-hidden ${!isVisible ? "hidden" : ""}`;

  // Log data being passed to the chart
  useEffect(() => {
    if (data && hierarchyData) {
      console.log("==== LineageTools Providing Data to Chart ====");
      console.log("Hierarchy data:", {
        type: typeof hierarchyData,
        isArray: Array.isArray(hierarchyData),
        length: hierarchyData?.length || 0,
        topLevelNodes: hierarchyData?.slice(0, 2).map(n => n.name) || []
      });
      console.log("Node data:", {
        hasNodes: !!(data?.nodes),
        nodeCount: data?.nodes?.length || 0,
        sampleNode: data?.nodes?.[0] ? {
          timeFields: Object.keys(data.nodes[0]).filter(k => 
            ['x_time', 'x_dist', 'div', 'num_date'].includes(k)),
          lineageFields: Object.keys(data.nodes[0]).filter(k => 
            k.includes('lineage'))
        } : null
      });
    }
  }, [data, hierarchyData]);

  // Track hierarchy data updates and log
  useEffect(() => {
    if (hierarchyData && hierarchyData.length > 0) {
      console.log("==== Hierarchy Data Ready for Chart ====");
      console.log("Structure:", {
        topLevelNodes: hierarchyData.length,
        sampleTopNodes: hierarchyData.slice(0, 3).map(n => n.name),
        topNodeCounts: hierarchyData.slice(0, 3).map(n => ({
          name: n.name,
          count: n.count,
          originalCount: n.originalCount,
          childCount: n.children?.length || 0
        }))
      });
    }
  }, [hierarchyData]);
  
  // Track data updates and log
  useEffect(() => {
    if (data && data.nodes && data.nodes.length > 0) {
      console.log("==== Node Data Ready for Chart ====");
      console.log("Structure:", {
        totalNodes: data.nodes.length,
        firstNode: data.nodes[0] ? {
          timeFields: ['x_time', 'x_dist', 'div', 'num_date'].filter(f => data.nodes[0][f] !== undefined),
          lineageFields: Object.keys(data.nodes[0]).filter(k => k.includes('lineage')),
          hasMeta: !!data.nodes[0].meta
        } : null
      });
    }
  }, [data]);

  // Find the buildLineageHierarchy function and add logging to it
  const buildLineageHierarchy = (nodes, lineageField) => {
    console.log("Building lineage hierarchy with field:", lineageField);

    if (!nodes || !nodes.length) {
      console.warn("No nodes provided to build hierarchy");
      return [];
    }

    // Check if lineage field exists in nodes
    const sampleNode = nodes[0];
    const hasLineageField = sampleNode && 
      (sampleNode[lineageField] || 
       sampleNode.lineage || 
       sampleNode.meta_pangolin_lineage);
    
    if (!hasLineageField) {
      console.warn("No lineage field found in nodes:", {
        requestedField: lineageField,
        availableFields: sampleNode ? Object.keys(sampleNode) : [],
        metaFields: sampleNode?.meta ? Object.keys(sampleNode.meta) : []
      });
    }
    
    // Start processing
    try {
      // Map to track lineages and their counts
      const lineageMap = new Map();
      
      // First pass: count lineages
      console.log("Counting lineages from", nodes.length, "nodes");
      
      for (const node of nodes) {
        if (!node) continue;
        
        // Try to get lineage from different possible fields
        let lineage = null;
        
        // First try the specified field
        if (lineageField && node[lineageField]) {
          lineage = node[lineageField];
        } 
        // Then try common lineage fields
        else if (node.lineage) {
          lineage = node.lineage;
        }
        else if (node.meta_pangolin_lineage) {
          lineage = node.meta_pangolin_lineage;
        }
        // Check meta object if available
        else if (node.meta) {
          for (const key in node.meta) {
            if (key.toLowerCase().includes('lineage') && node.meta[key]) {
              lineage = node.meta[key];
              break;
            }
          }
        }
        
        if (!lineage) continue;
        
        // Count this lineage
        if (lineageMap.has(lineage)) {
          lineageMap.set(lineage, lineageMap.get(lineage) + 1);
        } else {
          lineageMap.set(lineage, 1);
        }
      }
      
      console.log("Found", lineageMap.size, "unique lineages");
      
      // Now build hierarchy
      const rootNodes = [];
      const lineageNodes = new Map();
      
      // Create nodes for each lineage
      for (const [lineageName, count] of lineageMap.entries()) {
        const node = {
          name: lineageName,
          originalCount: count, // Direct count for this exact lineage
          count: count,         // Will be updated to include children
          children: []
        };
        
        lineageNodes.set(lineageName, node);
      }
      
      // Organize into hierarchy - for Pango lineages
      for (const lineageName of lineageNodes.keys()) {
        const node = lineageNodes.get(lineageName);
        
        // For hierarchical lineages like "B.1.1.7"
        if (lineageName.includes('.')) {
          const parts = lineageName.split('.');
          
          // Remove the last segment to get the parent
          parts.pop(); 
          const parentName = parts.join('.');
          
          // If we have the parent, add this as its child
          if (lineageNodes.has(parentName)) {
            const parentNode = lineageNodes.get(parentName);
            parentNode.children.push(node);
            
            // Update parent's count to include this child
            parentNode.count += node.originalCount;
            
            // Go up the chain to update all ancestors' counts
            let currentParentName = parentName;
            while (currentParentName.includes('.')) {
              const parts = currentParentName.split('.');
              parts.pop();
              const grandparentName = parts.join('.');
              
              if (lineageNodes.has(grandparentName)) {
                const grandparentNode = lineageNodes.get(grandparentName);
                grandparentNode.count += node.originalCount;
                currentParentName = grandparentName;
              } else {
                break;
              }
            }
            
            // For lineages like B.1, also update the top-level parent (B)
            if (currentParentName.includes('.')) {
              const topLevelName = currentParentName.split('.')[0];
              if (lineageNodes.has(topLevelName)) {
                const topLevelNode = lineageNodes.get(topLevelName);
                topLevelNode.count += node.originalCount;
              }
            }
            
            continue; // Skip adding to root nodes since we added to parent
          }
        }
        // For recombinant lineages like XBB.1
        else if (lineageName.startsWith('X') && lineageName.length > 1) {
          // Check if it has sub-parts, like XBB.1
          if (lineageName.includes('.')) {
            const baseName = lineageName.split('.')[0]; // e.g., XBB
            
            if (lineageNodes.has(baseName)) {
              const parentNode = lineageNodes.get(baseName);
              parentNode.children.push(node);
              parentNode.count += node.originalCount;
              continue;
            }
          }
        }
        
        // If we get here, it's a root node
        rootNodes.push(node);
      }
      
      // Sort children by count (descending)
      const sortNodeChildren = (node) => {
        if (node.children && node.children.length > 0) {
          node.children.sort((a, b) => b.count - a.count);
          node.children.forEach(sortNodeChildren);
        }
      };
      
      // Sort root nodes by count
      rootNodes.sort((a, b) => b.count - a.count);
      
      // Sort all children recursively
      rootNodes.forEach(sortNodeChildren);
      
      console.log("Hierarchy built successfully with", rootNodes.length, "top-level nodes");
      return rootNodes;
    } catch (err) {
      console.error("Error in buildLineageHierarchy:", err);
      return [];
    }
  }

  return (
    <div className={containerClasses}>
      <div className="px-4 py-3 border-b flex justify-between items-center">
        <h2 className="font-bold text-gray-800">Lineage Tools</h2>
        <Button 
          className="text-xs py-1 px-2"
          onClick={toggleSidebar}
        >
          Hide
        </Button>
      </div>
      
      {/* Tabs */}
      <div className="border-b flex">
        <button 
          className={`flex-1 py-2 px-4 text-sm font-medium ${activeTab === 'lineages' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'}`}
          onClick={() => setActiveTab('lineages')}
        >
          Lineages
        </button>
        <button 
          className={`flex-1 py-2 px-4 text-sm font-medium ${activeTab === 'autolin' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500'}`}
          onClick={() => setActiveTab('autolin')}
        >
          AutoLineage
        </button>
      </div>
      
      {activeTab === 'lineages' && (
        <div className="flex-grow flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="p-3 border-b">
            <div className="flex mb-2 items-center">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Search lineages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <FaFilter className="absolute text-gray-400 left-2.5 top-2.5" size={12} />
              </div>
              
              {selectedCategory && (
                <Button 
                  className="ml-2 text-xs py-1 px-2"
                  onClick={handleReset}
                >
                  Clear
                </Button>
              )}
            </div>
            
            <div className="flex items-center justify-between text-xs">
              <div className="flex space-x-1">
                <button 
                  className={`p-1 rounded border ${viewMode === 'flat' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}`}
                  onClick={() => setViewMode('flat')}
                  title="Flat view"
                >
                  <FaList size={12} />
                </button>
                <button 
                  className={`p-1 rounded border ${viewMode === 'hierarchical' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 hover:bg-gray-100'}`}
                  onClick={() => setViewMode('hierarchical')}
                  title="Hierarchical view"
                >
                  <FaStream size={12} />
                </button>
              </div>
              
              {hasPangoLineages && (
                <button 
                  className={`p-1 px-2 text-xs rounded border ${
                    useHierarchicalColors 
                      ? 'bg-blue-100 border-blue-300 font-medium text-blue-700' 
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
                  }`}
                  onClick={() => setUseHierarchicalColors(!useHierarchicalColors)}
                  title="Use hierarchical colors for Pango lineages"
                >
                  Pango Colors
                </button>
              )}
            </div>
          </div>
          
          {/* Status bar */}
          <div className="text-xs text-gray-500 p-2 border-b">
            {isLoading ? (
              <div className="text-center py-1">Loading lineages...</div>
            ) : (
              <>
                {filteredItems.length} lineages {keyStuff?.length > 0 && `(${keyStuff.length} total)`}
                {selectedCategory && (
                  <div className="mt-1 py-1 px-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-800">
                    <strong>{selectedCategory}</strong> selected
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Lineage list */}
          <div className="flex-grow overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-4 text-gray-500">
                Loading lineage data...
              </div>
            ) : viewMode === 'flat' ? (
              <>
                {filteredItems.length > 0 ? (
                  <ul className="divide-y divide-gray-100">
                    {filteredItems.map((category) => {
                      const itemColor = useHierarchicalColors && isPangoLineage(category.value)
                        ? getLineageColor(category.value)
                        : category.color;
                        
                      // Look up the full node from hierarchyData to get both counts
                      const nodeWithCounts = hierarchyData.find(n => n.name === category.value) || 
                        hierarchyData.flatMap(n => n.children || []).find(c => c.name === category.value);
                        
                      const directCount = nodeWithCounts?.originalCount || category.count;
                      const totalCount = nodeWithCounts?.count || category.count;
                      const sampleCount = nodeWithCounts?.sampleCount;
                      const totalTaxa = nodeWithCounts?.totalTaxa;
                      const hasChildren = totalCount > directCount;
                      const hasTaxaInfo = sampleCount !== undefined && totalTaxa !== undefined;
                      
                      // Check relationship with selected lineage
                      const relationship = checkLineageRelationship(category.value, selectedCategory);
                      
                      return (
                        <li 
                          key={category.value || 'unknown'} 
                          className={`text-sm cursor-pointer py-2 px-3 flex justify-between ${
                            relationship === 'self' ? "bg-blue-100 font-medium" : 
                            relationship === 'parent' ? "bg-blue-50" :
                            relationship === 'child' ? "bg-indigo-50" :
                            "hover:bg-gray-50"
                          }`}
                          onClick={() => handleCategoryClick(category.value)}
                        >
                          <div 
                            className="flex items-center"
                            style={{ 
                              maxWidth: "60%", 
                              overflow: "hidden", 
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            <span 
                              className={`inline-block w-3 h-3 mr-2 rounded-full ${
                                relationship === 'self' ? "ring-2 ring-blue-400" :
                                relationship === 'parent' ? "ring-1 ring-blue-300" : 
                                relationship === 'child' ? "ring-1 ring-indigo-300" : ""
                              }`}
                              style={{ backgroundColor: `rgb(${itemColor.join(',')})` }}
                            />
                            <span>{category.value || 'N/A'}</span>
                            {relationship === 'self' && (
                              <FaCheck className="ml-1 text-blue-600" size={10} />
                            )}
                          </div>
                          <div className="flex items-center">
                            {hasTaxaInfo ? (
                              <>
                                {/* Sample count (leaf nodes) */}
                                <div 
                                  className="bg-green-50 px-1.5 py-0.5 text-xs text-green-700 border border-green-100 rounded-l"
                                  title="Samples (leaf nodes)"
                                >
                                  {sampleCount.toLocaleString()}
                                </div>
                                
                                {/* Total taxa count (if different from sample count) */}
                                {totalTaxa > sampleCount && (
                                  <div 
                                    className="bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700 border border-l-0 border-gray-200 rounded-r"
                                    title="Total taxa (samples + internal nodes)"
                                  >
                                    {totalTaxa.toLocaleString()}
                                  </div>
                                )}
                              </>
                            ) : (
                              // Legacy format
                              <>
                                {hasChildren && (
                                  <>
                                    <div className="text-xs bg-blue-50 px-1.5 py-0.5 rounded-l text-blue-700 border border-r-0 border-blue-200" title="Direct samples">
                                      {directCount.toLocaleString()}
                                    </div>
                                    <div className="text-xs bg-gray-50 px-1.5 py-0.5 rounded-r text-gray-700 border border-gray-200" title="Total including children">
                                      {totalCount.toLocaleString()}
                                    </div>
                                  </>
                                )}
                                {!hasChildren && (
                                  <span className="text-gray-500 tabular-nums">{directCount.toLocaleString()}</span>
                                )}
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    {searchTerm ? 'No matching lineages found' : 'No lineage data available'}
                  </div>
                )}
              </>
            ) : (
              <>
                {hierarchyData.length > 0 ? (
                  <ul className="space-y-0">
                    {renderHierarchicalItems}
                  </ul>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    {searchTerm ? 'No matching lineages found' : 'No lineage data available'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      
      {activeTab ==='autolin' && (
        <div className="p-4 flex flex-col h-full overflow-auto">
          <h3 className="text-sm font-medium mb-2">Automated Lineage Designation</h3>
          <div className="mb-3">
            <button 
              className={`w-full text-xs py-2 px-3 border rounded focus:outline-none ${
                  autolinGenerated 
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' 
                    : 'hover:bg-gray-50'
                }`}           
              onClick={() => {
                // Add your button functionality here
                setAutolinGenerated(true);
                console.log("Generating AutoLin Designations...");
              }}
            >
              Generate Autolin Designations
            </button>
          </div>
  
          
          
          {isLoading ? (
            <div className="text-center py-4 text-gray-500">
              Loading lineage statistics...
            </div>
          ) : (
            <>
              {/* Show basic stats at the top */}
              <div className="text-xs text-gray-700 mb-4">
                <p>
                  Total Lineages: <strong>{keyStuff?.length || 0}</strong>
                  {hierarchyData[0]?.sampleCount && (
                    <>
                      {' • '}Samples: <strong>{
                        hierarchyData.reduce((sum, node) => sum + (node.sampleCount || 0), 0).toLocaleString()
                      }</strong>
                    </>
                  )}
                </p>
              </div>
              
              
              {/* Show time chart if enabled */}
              {/*{showTimeChart && (
                <div className="lineage-time-chart-container">
                  {console.log("Rendering LineageTimeChart with:", { 
                    hasData: !!data, 
                    hasHierarchyData: !!hierarchyData,
                    selectedLineage
                  })}
                  <LineageTimeChart
                    data={data}
                    hierarchyData={hierarchyData}
                    xType={xType || 'x_dist'}
                    selectedCategory={selectedLineage}
                    getLineageColor={getColorForLineage}
                  />
                </div>
              )}
            */}
              
              {/* Controls for the chart */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between text-xs mb-2">
                  <label htmlFor="max-depth">Maximum Depth:</label>
                  <div>
                    <input 
                      id="max-depth"
                      type="range" 
                      min="1" 
                      max="5"
                      value={maxChartDepth}
                      onChange={(e) => setMaxChartDepth(parseInt(e.target.value, 10))}
                      className="w-24"
                    />
                    <span className="ml-2">{maxChartDepth}</span>
                  </div>
                </div>
                
                <div className="text-xs text-gray-500">
                  Switch between time views using the main time control at the top of the app
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}, arePropsEqual); // Use our custom comparison function

export default LineageTools; 