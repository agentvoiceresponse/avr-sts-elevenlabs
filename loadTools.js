const fs = require('fs');
const path = require('path');

/**
 * Loads all available tools from both avr_tools and tools directories
 * @returns {Array} List of all available tools
 */
function loadTools() {
  // Define tool directory paths
  const avrToolsDir = path.join(__dirname, 'avr_tools');  // Project-provided tools
  const toolsDir = path.join(__dirname, 'tools');         // User custom tools
  
  let allTools = [];
  
  // Helper function to load tools from a directory
  const loadToolsFromDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) return [];
    
    return fs.readdirSync(dirPath)
      .map(file => {
        const tool = require(path.join(dirPath, file));
        return {
          type: 'function',
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema || {},
        };
      });
  };

  // Load tools from both directories
  allTools = [
    ...loadToolsFromDir(avrToolsDir),  // Project tools
    ...loadToolsFromDir(toolsDir)      // Custom tools
  ];

  // Warning if no tools found
  if (allTools.length === 0) {
    console.warn(`No tools found in ${avrToolsDir} or ${toolsDir}`);
  }

  return allTools;
}

/**
 * Gets the handler for a specific tool
 * @param {string} name - Name of the tool
 * @returns {Function} Tool handler
 * @throws {Error} If the tool is not found
 */
function getToolHandler(name) {
  // Possible paths for the tool file
  const possiblePaths = [
    path.join(__dirname, 'avr_tools', `${name}.js`),  // First check in avr_tools
    path.join(__dirname, 'tools', `${name}.js`)       // Then check in tools
  ];

  // Find the first valid path
  const toolPath = possiblePaths.find(path => fs.existsSync(path));
  
  if (!toolPath) {
    throw new Error(`Tool "${name}" not found in any available directory`);
  }

  const tool = require(toolPath);
  return tool.handler;
}

module.exports = { loadTools, getToolHandler };