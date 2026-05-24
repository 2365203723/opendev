const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3099;
const PROJECTS_DIR = 'E:/projects';
const LOGS_DIR = 'G:/logs/agents';
const LESSONS_DIR = 'H:/claude-assets/lessons';

function getProjects() {
    const projects = [];
    try {
        const dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
        for (const dir of dirs) {
            if (!dir.isDirectory()) continue;
            const statusPath = path.join(PROJECTS_DIR, dir.name, '.status.json');
            if (fs.existsSync(statusPath)) {
                const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                projects.push(data);
            }
        }
    } catch (e) { /* dir may not exist */ }
    return projects;
}

function getRecentLogs() {
    const logs = [];
    try {
        const files = fs.readdirSync(LOGS_DIR)
            .filter(f => f.endsWith('.log'))
            .sort()
            .reverse()
            .slice(0, 10);

        for (const file of files) {
            const parts = file.replace('.log', '').split('-');
            const agent = parts.length > 1 ? parts[parts.length - 2] : 'unknown';
            const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf8');
            const lastLines = content.split('\n').filter(Boolean).slice(-3);
            for (const line of lastLines) {
                logs.push({
                    time: file.slice(-18, -4),
                    agent,
                    message: line.slice(0, 120),
                    level: line.toLowerCase().includes('error') ? 'error' : 'info'
                });
            }
        }
    } catch (e) { /* dir may not exist */ }
    return logs.slice(0, 20);
}

function getLessonsCount() {
    try {
        return fs.readdirSync(LESSONS_DIR).filter(f => f.endsWith('.md') && f !== 'INDEX.md').length;
    } catch (e) { return 0; }
}

function getActiveAgents(projects) {
    let count = 0;
    for (const p of projects) {
        for (const [, info] of Object.entries(p.agents || {})) {
            if (info.status === 'in_progress') count++;
        }
    }
    return count;
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/status') {
        const projects = getProjects();
        const response = {
            projects,
            logs: getRecentLogs(),
            activeAgents: getActiveAgents(projects),
            lessonsCount: getLessonsCount(),
            timestamp: new Date().toISOString()
        };
        res.end(JSON.stringify(response));
    } else if (req.url === '/') {
        res.setHeader('Content-Type', 'text/html');
        const htmlPath = path.join(__dirname, 'index.html');
        res.end(fs.readFileSync(htmlPath, 'utf8'));
    } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found' }));
    }
});

server.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
});
