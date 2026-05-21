module.exports = {
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80
      }
    }
  }
};
