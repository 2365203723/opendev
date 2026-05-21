const fs = require('fs');

function countLessonFiles(lessonsDir) {
  if (!fs.existsSync(lessonsDir)) return 0;

  return fs.readdirSync(lessonsDir)
    .filter(file => file.endsWith('.md') && file !== 'INDEX.md')
    .length;
}

module.exports = { countLessonFiles };
