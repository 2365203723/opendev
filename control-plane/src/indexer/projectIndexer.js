const { readProjectStatusFiles } = require('./statusReader');

function createProjectIndexer({ config, store }) {
  return {
    rebuild: () => {
      const result = readProjectStatusFiles(config.projectsDir);
      result.projects.forEach(projectIndex => store.replaceProjectIndex(projectIndex));
      return {
        indexedProjects: result.projects.length,
        errors: result.errors
      };
    }
  };
}

module.exports = { createProjectIndexer };
