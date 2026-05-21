const { readProjectStatusFiles } = require('./statusReader');

function createProjectIndexer({ config, store } = {}) {
  if (!config || !store) return null;

  return {
    rebuild: () => {
      const result = readProjectStatusFiles(config.projectsDir);
      if (store.replaceProjectIndexes) {
        store.replaceProjectIndexes(result.projects);
      } else {
        result.projects.forEach(projectIndex => store.replaceProjectIndex(projectIndex));
      }
      return {
        indexedProjects: result.projects.length,
        errors: result.errors
      };
    }
  };
}

module.exports = { createProjectIndexer };
