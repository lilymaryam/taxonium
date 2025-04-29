/**
 * Utility functions for handling Pango lineage data
 */

/**
 * Parses a Pango lineage name to determine its hierarchical structure
 * @param {string} lineageName - The Pango lineage name (e.g., "B.1.1.7")
 * @returns {object} Object with parts array and parent lineage name
 */
export const parseLineageName = (lineageName) => {
  if (!lineageName) return { parts: [], parent: null };
  
  // Handle multi-letter root lineages (AY, BA, XBB, etc.)
  let parts;
  let parent = null;
  
  // Special handling for multi-letter root lineages
  if (/^[A-Z]{2,}($|\.)/.test(lineageName)) {
    const dotIndex = lineageName.indexOf('.');
    if (dotIndex > 0) {
      // Multi-letter root with children (e.g., "AY.4")
      const rootPart = lineageName.substring(0, dotIndex);
      const numericParts = lineageName.substring(dotIndex + 1).split('.');
      parts = [rootPart, ...numericParts];
      
      // For "AY.4", parent is "AY"
      parent = rootPart;
      
      // For "AY.4.2", parent is "AY.4"
      if (numericParts.length > 1) {
        parent = rootPart + '.' + numericParts.slice(0, numericParts.length - 1).join('.');
      }
    } else {
      // Just the root lineage (e.g., "AY")
      parts = [lineageName];
      parent = null;
    }
  } else {
    // Standard lineage handling (e.g., "B.1.1.7")
    parts = lineageName.split('.');
    parent = parts.length > 1 
      ? parts.slice(0, parts.length - 1).join('.') 
      : null;
  }
  
  return { parts, parent };
};

/**
 * Organizes lineage data into a hierarchical structure based on Pango naming
 * @param {Array} lineages - Array of lineage objects with value, count, and color properties
 * @param {Object} nodeTypes - Optional object with node type information (internal vs leaf)
 * @returns {Array} Hierarchical structure of lineages
 */
export const organizeLineageHierarchy = (lineages, nodeTypes = null) => {
  if (!lineages || !lineages.length) return [];
  
  // Create a map for quick access to lineages by name
  const lineageMap = {};
  
  // Helper to get all possible parent lineages from a lineage name
  // e.g., "B.1.1.7" -> ["B", "B.1", "B.1.1"]
  const getAllParentLineages = (lineageName) => {
    if (!lineageName) return [];
    
    // Handle special cases for multi-letter root lineages
    let parts;
    if (/^[A-Z]{2,}($|\.)/.test(lineageName)) {
      // This is a multi-letter root lineage like "AY" or "AY.4"
      const dotIndex = lineageName.indexOf('.');
      if (dotIndex > 0) {
        // Split into root + numeric parts, e.g., "AY.4.3" -> ["AY", "4", "3"]
        const rootPart = lineageName.substring(0, dotIndex);
        const numericParts = lineageName.substring(dotIndex + 1).split('.');
        parts = [rootPart, ...numericParts];
      } else {
        // Just the root like "AY" or "XBB"
        parts = [lineageName];
      }
    } else {
      // Regular lineage like "B.1.1.7"
      parts = lineageName.split('.');
    }
    
    const parents = [];
    
    // Build parent names from parts
    let currentParent = parts[0];
    parents.push(currentParent);
    
    for (let i = 1; i < parts.length; i++) {
      currentParent += `.${parts[i]}`;
      parents.push(currentParent);
    }
    
    // Remove the last one as it's the lineage itself
    parents.pop();
    
    return parents;
  };
  
  // First pass: Create nodes for all lineages that appear in the data
  lineages.forEach(lineage => {
    if (!lineage.value) return;
    
    if (!lineageMap[lineage.value]) {
      // Determine if the count represents leaf nodes, internal nodes, or both
      const isLeafCount = !nodeTypes || !nodeTypes[lineage.value] || nodeTypes[lineage.value] === 'leaf';
      
      lineageMap[lineage.value] = {
        name: lineage.value,
        count: lineage.count, // Total count will be recalculated
        originalCount: lineage.count, // Direct count for this lineage
        sampleCount: isLeafCount ? lineage.count : 0, // Count of actual samples (leaves)
        internalCount: isLeafCount ? 0 : lineage.count, // Count of internal nodes
        color: lineage.color,
        children: [],
        isExpanded: false,
        level: getLineageLevel(lineage.value)
      };
    }
    
    // Ensure all parent lineages exist in the map (even if not in original data)
    const parentLineages = getAllParentLineages(lineage.value);
    parentLineages.forEach(parentName => {
      if (!lineageMap[parentName]) {
        // Create parent if it doesn't exist
        lineageMap[parentName] = {
          name: parentName,
          count: 0, // Will be accumulated later
          originalCount: 0, // No direct samples
          sampleCount: 0, // Will be accumulated from children
          internalCount: 0, // Will be accumulated from children
          color: generatePangoLineageColor(parentName),
          children: [],
          isExpanded: false,
          level: getLineageLevel(parentName)
        };
      }
    });
  });
  
  // Second pass: Build the hierarchy and accumulate counts
  const rootLineages = [];
  
  // Link children to parents and accumulate counts
  Object.values(lineageMap).forEach(node => {
    const { parent } = parseLineageName(node.name);
    
    if (!parent) {
      // This is a root-level lineage (e.g., "A", "B", "AY")
      rootLineages.push(node);
    } else if (lineageMap[parent]) {
      // Add as a child to its parent
      lineageMap[parent].children.push(node);
      // Add reference to parent for child nodes to support percentages
      node.parent = lineageMap[parent];
    } else {
      // Parent doesn't exist in our data, add to root
      rootLineages.push(node);
    }
  });
  
  // Third pass: Recursive function to accumulate counts from children
  const accumulateChildCounts = (node) => {
    if (!node.children || node.children.length === 0) {
      // For leaf nodes in the hierarchy, return various counts
      return {
        totalCount: node.originalCount,
        sampleCount: node.sampleCount,
        internalCount: node.internalCount
      };
    }
    
    // Accumulate counts from all children
    let totalChildrenCount = 0;
    let totalSampleCount = node.sampleCount; // Start with this node's own sample count
    let totalInternalCount = node.internalCount; // Start with this node's own internal count
    
    for (const child of node.children) {
      const childCounts = accumulateChildCounts(child);
      totalChildrenCount += childCounts.totalCount;
      totalSampleCount += childCounts.sampleCount;
      totalInternalCount += childCounts.internalCount;
    }
    
    // Update node's counts
    node.count = node.originalCount + totalChildrenCount; // Total count including children
    node.sampleCount = totalSampleCount; // Total sample (leaf) count including children
    node.internalCount = totalInternalCount; // Total internal node count including children
    node.totalTaxa = totalSampleCount + totalInternalCount; // Total taxa (leaves + internal nodes)
    
    return {
      totalCount: node.count,
      sampleCount: totalSampleCount,
      internalCount: totalInternalCount
    };
  };
  
  // Apply count accumulation to all root lineages
  rootLineages.forEach(accumulateChildCounts);
  
  // Sort children by total count (including child counts) descending
  const sortByCount = (a, b) => b.count - a.count;
  
  const sortChildren = (node) => {
    if (node.children && node.children.length > 0) {
      node.children.sort(sortByCount);
      node.children.forEach(sortChildren);
    }
  };
  
  rootLineages.sort(sortByCount);
  rootLineages.forEach(sortChildren);
  
  return rootLineages;
};

/**
 * Get the level of a lineage in the Pango hierarchy
 * @param {string} lineageName - The Pango lineage name (e.g., "B.1.1.7")
 * @returns {number} The hierarchy level (0 for A/B, 1 for A.1/B.1, etc.)
 */
export const getLineageLevel = (lineageName) => {
  if (!lineageName) return 0;
  
  // Handle multi-letter root lineages (AY, BA, XBB, etc.)
  if (/^[A-Z]{2,}($|\.)/.test(lineageName)) {
    if (lineageName.indexOf('.') === -1) {
      // Just a root like "AY" or "XBB" - level 0
      return 0;
    } else {
      // Count dots for level beyond the root
      return lineageName.split('.').length - 1;
    }
  }
  
  // Standard processing for regular lineages
  const { parts } = parseLineageName(lineageName);
  return parts.length - 1;
};

/**
 * Check if a lineage is a direct child of another lineage
 * @param {string} childLineage - The potential child lineage (e.g., "B.1.1")
 * @param {string} parentLineage - The potential parent lineage (e.g., "B.1")
 * @returns {boolean} True if childLineage is a direct child of parentLineage
 */
export const isDirectChild = (childLineage, parentLineage) => {
  if (!childLineage || !parentLineage) return false;
  
  // Special handling for multi-letter lineages
  if (/^[A-Z]{2,}($|\.)/.test(childLineage)) {
    // Get the correct parts using extractLineageRoot
    const { rootLineage: childRoot, nameParts: childParts } = extractLineageRoot(childLineage);
    const { rootLineage: parentRoot, nameParts: parentParts } = extractLineageRoot(parentLineage);
    
    // For multi-letter lineages, the parent must be the same root
    // And child must have exactly one more level
    if (childRoot !== parentRoot) {
      return false;
    }
    
    return childParts.length === parentParts.length + 1 &&
           childParts.slice(0, parentParts.length).join('.') === parentParts.join('.');
  }
  
  // Standard lineage handling
  const childParts = parseLineageName(childLineage).parts;
  const parentParts = parseLineageName(parentLineage).parts;
  
  // Direct child has exactly one more part than parent
  if (childParts.length !== parentParts.length + 1) return false;
  
  // All parent parts must match the beginning of the child parts
  for (let i = 0; i < parentParts.length; i++) {
    if (parentParts[i] !== childParts[i]) return false;
  }
  
  return true;
};

/**
 * Determine if a category name is a Pango lineage
 * @param {string} name - The category name to check
 * @returns {boolean} True if the name follows Pango lineage format
 */
export const isPangoLineage = (name) => {
  if (!name) return false;
  
  // Basic check: starts with a letter, potentially followed by dots and numbers
  return /^[A-Za-z](\.\d+)*$/.test(name);
};

/**
 * Determines the root lineage component for a given Pango lineage name
 * @param {string} lineageName - The Pango lineage name (e.g., "B.1.1.7", "AY.4", "XBB.1.5")
 * @returns {object} Object with rootLineage and nameParts
 */
export const extractLineageRoot = (lineageName) => {
  if (!lineageName) return { rootLineage: null, nameParts: [] };
  
  let rootLineage, nameParts;
  
  // Handle recombinant lineages (X lineages)
  if (lineageName.startsWith('X')) {
    // Recombinants get special treatment
    if (lineageName.length > 1 && lineageName.indexOf('.') > 0) {
      // Something like XA.1 or XBB.1.5
      const dotIndex = lineageName.indexOf('.');
      rootLineage = lineageName.substring(0, dotIndex);
      nameParts = [rootLineage, ...lineageName.substring(dotIndex + 1).split('.')];
    } else if (lineageName.length > 1) {
      // Something like XA, XBB (no dot)
      rootLineage = lineageName;
      nameParts = [rootLineage];
    } else {
      // Just X (unlikely)
      rootLineage = lineageName;
      nameParts = [rootLineage];
    }
  }
  // Handle 2-letter root lineages like BA, BQ, AY, etc.
  else if (/^[A-Z]{2,}($|\.)/.test(lineageName)) {
    // Multi-letter root like BA.2, AY.4, etc.
    const dotIndex = lineageName.indexOf('.');
    if (dotIndex > 0) {
      rootLineage = lineageName.substring(0, dotIndex);
      nameParts = [rootLineage, ...lineageName.substring(dotIndex + 1).split('.')];
    } else {
      // Just BA, BQ, AY, etc. with no dot
      rootLineage = lineageName;
      nameParts = [rootLineage];
    }
  } 
  // Standard single-letter root lineages (A, B)
  else {
    const parts = lineageName.split('.');
    rootLineage = parts[0];
    nameParts = parts;
  }
  
  return { rootLineage, nameParts };
};

/**
 * Generates a hierarchical color scheme for lineages
 * 
 * This ensures that:
 * - Major lineages (A, B, etc.) have distinct colors
 * - Related lineages have similar colors with consistent variations
 * - More prevalent lineages are darker/bolder
 * - Parent-child relationships are visually preserved
 * 
 * @param {string} lineageName - The lineage name (e.g., "B.1.1.7")
 * @param {object|null} lineageData - Optional lineage data with count info for prevalence-based coloring
 * @returns {Array} RGB color array [r, g, b]
 */
export const generatePangoLineageColor = (lineageName, lineageData = null) => {
  if (!lineageName || typeof lineageName !== 'string') return [180, 180, 180]; // Default gray for null/undefined
  
  // RGB to HSL conversion helper
  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      
      h /= 6;
    }
    
    return [h, s, l];
  };
  
  // HSL to RGB conversion helper
  const hslToRgb = (h, s, l) => {
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };
  
  /**
   * Generate a color for lineages that don't have a predefined color
   * @param {string} lineageName - The lineage name to generate a color for
   * @returns {Array} RGB color array [r, g, b]
   */
  const generateColorForUnknownLineage = (lineageName) => {
    // Generate a deterministic but vibrant color based on the lineage name
    const seed = lineageName.split('').reduce((acc, char, i) => 
      acc + (char.charCodeAt(0) * (i + 1) * 37), 0);
    
    // Use modular arithmetic to create a consistent but varied color
    const h = (seed % 360) / 360; // Generate a hue between 0-1
    const s = 0.7 + (seed % 20) / 100; // High saturation (0.7-0.9)
    const l = 0.5; // Medium lightness for visibility
    
    // Convert to RGB and return
    return hslToRgb(h, s, l);
  };
  
  // Handle non-hierarchical names (without dots) - just return a hash-based color
  if (!lineageName.includes('.') && !/^[A-Za-z]+$/.test(lineageName)) {
    return generateColorForUnknownLineage(lineageName);
  }
  
  // Extract lineage parts
  const { rootLineage, nameParts } = extractLineageRoot(lineageName);
  
  // Base colors for major lineage roots - highly distinct colors
  // Using saturated HSL-derived colors for clear differentiation
  const baseColors = {
    // Original major lineages - primary distinct colors
    'A': [200, 40, 40],    // Red
    'B': [40, 40, 200],    // Blue
    'C': [40, 160, 40],    // Green
    'D': [180, 140, 20],   // Gold
    'E': [160, 40, 160],   // Purple
    'F': [40, 160, 160],   // Teal
    'G': [180, 70, 40],    // Orange
    'H': [120, 40, 140],   // Violet
    'I': [70, 130, 50],    // Olive
    'J': [160, 60, 90],    // Rose
    'K': [40, 100, 140],   // Steel Blue
    'L': [140, 120, 40],   // Mustard
    'M': [100, 40, 80],    // Burgundy
    'N': [40, 120, 100],   // Seafoam
    'O': [170, 70, 70],    // Coral
    'P': [70, 70, 170],    // Periwinkle
    'Q': [150, 150, 40],   // Olive Gold
    'R': [90, 40, 140],    // Plum
    'S': [40, 110, 70],    // Forest
    'T': [140, 80, 40],    // Rust
    'U': [80, 40, 120],    // Lavender
    'V': [100, 130, 40],   // Chartreuse
    'W': [150, 60, 100],   // Pink
    'Z': [60, 120, 120],   // Aqua
    
    // Alpha lineages - more vibrant orange family
    'AY': [240, 100, 60],  // Bright orange-red for Alpha variant (more vibrant)
    'AU': [235, 85, 55],
    'AZ': [245, 95, 65],
    'AT': [230, 90, 50],
    'AS': [220, 80, 45],
    'AA': [225, 85, 50],
    'AB': [215, 75, 45],
    'AC': [210, 70, 40],
    'AD': [205, 65, 35],
    'AE': [200, 60, 30],
    'AF': [195, 55, 25],
    'AG': [190, 50, 20],
    'AH': [185, 45, 15],
    'AI': [180, 40, 10],
    'AJ': [175, 35, 5],
    'AK': [170, 30, 0],
    'AL': [175, 35, 5],
    'AM': [180, 40, 10],
    'AN': [185, 45, 15],
    'AO': [190, 50, 20],
    'AP': [195, 55, 25],
    'AQ': [200, 60, 30],
    'AR': [205, 65, 35],
    'AV': [210, 70, 40],
    'AW': [215, 75, 45],
    'AX': [220, 80, 50],
    
    // Beta/Delta lineages - blue family
    'BJ': [60, 100, 210],
    'BL': [70, 120, 220],
    'BN': [80, 140, 230],
    
    // Other common top-level lineages
    'CH': [60, 180, 100],  // Green-teal variant
    'CJ': [70, 170, 90],
    'CR': [50, 190, 110],
    
    'DL': [200, 160, 40],  // Gold variants
    'DR': [210, 150, 30],
    
    'EG': [180, 60, 180],  // Purple variants
    'EH': [170, 50, 190],
    'EL': [190, 70, 170],
    
    'FL': [60, 190, 190],  // Teal variants
    'FM': [50, 180, 200],
    
    'HK': [140, 60, 160],  // Violet variants
    'HV': [130, 50, 170],
    
    'JN': [180, 80, 100],  // Mauve variants
    'JP': [170, 70, 110],
    
    'KP': [60, 120, 160],  // Blue-gray variants
    'KL': [50, 110, 170],
    
    // Omicron family - variations of blue
    'BA': [70, 70, 180],   // Base Omicron Blue
    'BB': [60, 80, 190],
    'BC': [50, 90, 200],
    'BD': [60, 100, 190],
    'BE': [70, 110, 180],
    'BF': [80, 120, 170],
    'BG': [90, 130, 160],
    'BH': [100, 140, 150],
    'BJ': [110, 150, 140],
    'BK': [120, 160, 130],
    'BL': [130, 170, 120],
    'BM': [140, 180, 110],
    'BN': [150, 190, 100],
    'BP': [140, 170, 110],
    'BQ': [130, 160, 120],
    'BR': [120, 150, 130],
    'BS': [110, 140, 140],
    'BT': [100, 130, 150],
    'BU': [90, 120, 160],
    'BV': [80, 110, 170],
    'BW': [70, 100, 180],
    'BY': [60, 90, 190],
    'BZ': [50, 80, 200],
    
    // Recombinant lineages - purple family
    'X': [130, 60, 130],   // Base recombinant
    'XA': [140, 60, 140],
    'XB': [150, 60, 150],
    'XC': [160, 60, 160],
    'XD': [170, 60, 170],
    'XE': [180, 60, 180],
    'XF': [170, 60, 170],
    'XG': [160, 60, 160],
    'XH': [150, 60, 150],
    'XJ': [140, 60, 140],
    'XK': [130, 60, 130],
    'XL': [120, 60, 120],
    'XM': [110, 60, 110],
    'XN': [100, 60, 100],
    'XP': [110, 60, 110],
    'XQ': [120, 60, 120],
    'XR': [130, 60, 130],
    'XS': [140, 60, 140],
    'XBB': [140, 70, 170], // Special distinction for important recombinants
    'XBF': [150, 80, 180],
    'XBC': [160, 90, 190]
  };
  
  // Default color if we don't have a mapping (vibrant blue-purple instead of gray)
  const defaultColor = [130, 100, 180];
  
  // Get the base color for this lineage root
  let baseColor;
  
  // First priority: direct match in baseColors
  if (baseColors[rootLineage]) {
    baseColor = [...baseColors[rootLineage]];
  }
  // Second priority: force specific problem lineages to have colors
  else if (rootLineage === 'BA') {
    // Force BA to have a vibrant blue color family
    baseColor = [70, 70, 180];
  }
  // Third priority: derive from parent letter for multi-letter lineages
  else if (rootLineage.length > 1) {
    const mainLetter = rootLineage.charAt(0);
    
    if (baseColors[mainLetter]) {
      // Start with the main letter's color as a base
      const parentColor = [...baseColors[mainLetter]];
      
      // Generate a more distinct and consistent variation based on secondary letters
      const secondaryPart = rootLineage.substring(1);
      
      // Convert to HSL for better color manipulation
      let [h, s, l] = rgbToHsl(...parentColor);
      
      // Create a hash from the secondary part
      const hash = secondaryPart.split('').reduce((acc, char, index) => {
        return acc + (char.charCodeAt(0) * (index + 1));
      }, 0);
      
      // Strong, deterministic variation based on the secondary part
      // We want significant but consistent shifts for multi-letter roots
      h = ((h * 360 + (hash % 120) - 60) / 360) % 1; // Larger hue shift for distinct variation
      if (h < 0) h += 1;
      
      // Make sure the color is vibrant for a top-level lineage
      s = Math.max(0.6, Math.min(0.9, s + 0.2)); // Higher saturation (0.6-0.9 range)
      l = Math.max(0.35, Math.min(0.55, l)); // Controlled lightness for visibility
      
      // Convert back to RGB
      baseColor = hslToRgb(h, s, l);
    } 
    // Fourth priority: generate a color directly from the lineage name
    else {
      baseColor = generateColorForUnknownLineage(rootLineage);
    }
  } 
  // Fall back to direct color generation
  else {
    baseColor = generateColorForUnknownLineage(rootLineage);
  }
  
  // For the root level (A, B, BA, etc.), return the base color, potentially adjusted by count
  if (nameParts.length === 1) {
    // If we have count data, adjust color intensity based on prevalence
    if (lineageData && lineageData.hierarchyData) {
      // Find the node for this lineage
      const rootNodes = lineageData.hierarchyData;
      const rootNode = rootNodes.find(node => node.name === lineageName);
      
      if (rootNode) {
        // Calculate prevalence relative to total
        const totalCount = lineageData.totalCount || 
          rootNodes.reduce((sum, node) => sum + (node.count || 0), 0);
        
        if (totalCount > 0) {
          const prevalence = rootNode.count / totalCount;
          
          // Convert to HSL for easier adjustments
          let [h, s, l] = rgbToHsl(...baseColor);
          
          // Larger lineages get more saturated, darker colors
          // Map prevalence (0-1) to adjustments in saturation and lightness
          const maxPrevalence = 0.3; // Assuming no single lineage has more than 30% of total
          const normalizedPrevalence = Math.min(1, prevalence / maxPrevalence);
          
          // More prevalent = more saturated and darker
          s = Math.min(1, s + normalizedPrevalence * 0.3); // Boost saturation for prevalent lineages
          l = Math.max(0.25, 0.4 - normalizedPrevalence * 0.15); // Darken prevalent lineages
          
          // Convert back to RGB
          return hslToRgb(h, s, l);
        }
      }
    }
    
    // For root lineages, make sure the color is vibrant
    const [h, s, l] = rgbToHsl(...baseColor);
    if (s < 0.5) { // If saturation is too low, boost it
      return hslToRgb(h, 0.7, l);
    }
    
    return baseColor;
  }
  
  // For deeper levels, systematically lighten the color based on depth
  // but also consider the count if available
  
  // Convert base color to HSL
  let [h, s, l] = rgbToHsl(...baseColor);
  
  // Calculate the depth of this lineage (number of parts beyond the root)
  const depth = nameParts.length - 1;
  
  // Base lightness parameters
  let baseLightness = 0.4;  // Base lightness for first level
  const maxLightness = 0.75; // Maximum lightness for deep levels
  const depthFactor = 0.08;  // How much lighter each level gets
  
  // If we have lineage data with counts, adjust based on prevalence
  let countAdjustment = 0;
  if (lineageData && lineageData.hierarchyData) {
    // Recursively find the node in the hierarchy
    const findNode = (nodes, targetName) => {
      for (const node of nodes) {
        if (node.name === targetName) {
          return node;
        }
        if (node.children && node.children.length > 0) {
          const found = findNode(node.children, targetName);
          if (found) return found;
        }
      }
      return null;
    };
    
    const node = findNode(lineageData.hierarchyData, lineageName);
    if (node) {
      const totalCount = lineageData.totalCount || 
        lineageData.hierarchyData.reduce((sum, rootNode) => sum + (rootNode.count || 0), 0);
      
      if (totalCount > 0) {
        // Calculate prevalence - larger lineages get darker colors
        const prevalence = node.count / totalCount;
        const maxPrevalence = 0.2; // Assuming no single lineage has more than 20% of total
        const normalizedPrevalence = Math.min(1, prevalence / maxPrevalence);
        
        // Make more prevalent lineages darker by reducing the base lightness
        // and increasing saturation
        countAdjustment = normalizedPrevalence * 0.15; // Up to 15% darkening based on prevalence
        baseLightness -= countAdjustment;
        s = Math.min(0.9, s + normalizedPrevalence * 0.1); // More saturated for prevalent lineages
      }
    }
  }
  
  // Calculate new lightness - base lightness adjusted for depth and prevalence
  // Depth increases lightness, prevalence decreases it
  l = Math.min(maxLightness, Math.max(0.25, baseLightness + (depth - 1) * depthFactor));
  
  // Small variations in hue and saturation based on specific parts
  // This helps distinguish siblings at the same level
  for (let i = 1; i < nameParts.length; i++) {
    const numericPart = parseInt(nameParts[i]);
    
    if (!isNaN(numericPart)) {
      // Use very small hue adjustments - stay close to parent hue
      // This ensures children are shades of the parent color, not different colors
      h += (numericPart % 12) * 0.005; // Very subtle hue shifts (was 0.01)
      if (h > 1) h -= 1;
      
      // Use lightness for the main variation instead
      // Higher numbers get slightly darker shades
      const lightnessAdjustment = -0.02 * (numericPart % 5) / 5; // Small adjustments
      l = Math.min(maxLightness, Math.max(0.25, l + lightnessAdjustment));
      
      // Minimal saturation adjustments
      s = Math.min(0.9, Math.max(0.2, s + 0.005)); // Very small adjustment
    }
  }
  
  // Convert back to RGB
  const adjustedColor = hslToRgb(h, s, l);
  
  // Safety check to ensure we never return gray colors
  const isGrayish = (rgb) => {
    const [r, g, b] = rgb;
    // Check if the color is too close to gray (all values similar)
    const average = (r + g + b) / 3;
    const variance = Math.sqrt(
      ((r - average) ** 2 + (g - average) ** 2 + (b - average) ** 2) / 3
    );
    
    // If the variance is small, the color is close to gray
    return variance < 25;
  };
  
  // If the color ended up gray, replace it with a vibrant alternative
  if (isGrayish(adjustedColor)) {
    // Generate a deterministic but vibrant color as a fallback
    const seed = lineageName.split('').reduce((acc, char, i) => 
      acc + (char.charCodeAt(0) * (i + 1) * 37), 0);
    
    // Use modular arithmetic to create a consistent but varied color
    const h = (seed % 360) / 360; // Generate a hue between 0-1
    const s = 0.7 + (seed % 20) / 100; // High saturation (0.7-0.9)
    const l = 0.5; // Medium lightness for visibility
    
    // Convert to RGB and return
    return hslToRgb(h, s, l);
  }
  
  return adjustedColor;
}; 