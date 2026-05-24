const { createCommandBuilder } = require('../src/commandBuilder');

describe('commandBuilder - Phase 4 四层 scope 支持', () => {
  let builder;

  beforeEach(() => {
    builder = createCommandBuilder();
  });

  describe('buildProjectCommand', () => {
    it('构建 project-scope 命令（兼容旧流程）', () => {
      const result = builder.buildProjectCommand('demo-project', 'architect', '执行设计审查', {
        workingDir: 'E:/projects/demo-project',
        agentFile: 'C:/Users/23652/.claude/agents/architect.md',
        model: 'claude-sonnet-4-6',
        timeout: 3600000
      });

      expect(result).toEqual({
        command: 'claude',
        args: [
          '--cwd', 'E:/projects/demo-project',
          '--agent', 'C:/Users/23652/.claude/agents/architect.md',
          '--model', 'claude-sonnet-4-6',
          '--timeout', '3600000',
          '执行设计审查'
        ],
        env: {
          PAPERCLIP_PROJECT_NAME: 'demo-project',
          PAPERCLIP_AGENT_ROLE: 'architect',
          PAPERCLIP_SCOPE_TYPE: 'project',
          PAPERCLIP_SCOPE_ID: 'demo-project'
        }
      });
    });

    it('省略可选参数时使用默认值', () => {
      const result = builder.buildProjectCommand('demo', 'backend', '实现 API');

      expect(result.args).toContain('--model');
      expect(result.args).toContain('claude-sonnet-4-6');
      expect(result.args).toContain('--timeout');
      expect(result.args).toContain('3600000');
    });
  });

  describe('buildMilestoneCommand', () => {
    it('构建 milestone-scope 命令', () => {
      const result = builder.buildMilestoneCommand(
        'prod-001',
        'ms-mvp',
        'pm-planner',
        '拆分 MVP 任务',
        {
          workingDir: 'E:/projects/demo',
          agentFile: 'C:/Users/23652/.claude/agents/pm-planner.md'
        }
      );

      expect(result.command).toBe('claude');
      expect(result.args).toContain('--cwd');
      expect(result.args).toContain('E:/projects/demo');
      expect(result.args).toContain('拆分 MVP 任务');
      expect(result.env).toEqual({
        PAPERCLIP_PRODUCT_ID: 'prod-001',
        PAPERCLIP_MILESTONE_ID: 'ms-mvp',
        PAPERCLIP_AGENT_ROLE: 'pm-planner',
        PAPERCLIP_SCOPE_TYPE: 'milestone',
        PAPERCLIP_SCOPE_ID: 'ms-mvp'
      });
    });
  });

  describe('buildWorkstreamCommand', () => {
    it('构建 workstream-scope 命令', () => {
      const result = builder.buildWorkstreamCommand(
        'prod-001',
        'ms-mvp',
        'ws-auth',
        'backend',
        '实现认证系统',
        {
          workingDir: 'E:/projects/demo',
          projectName: 'demo-project'
        }
      );

      expect(result.command).toBe('claude');
      expect(result.args).toContain('实现认证系统');
      expect(result.env).toEqual({
        PAPERCLIP_PRODUCT_ID: 'prod-001',
        PAPERCLIP_MILESTONE_ID: 'ms-mvp',
        PAPERCLIP_WORKSTREAM_ID: 'ws-auth',
        PAPERCLIP_AGENT_ROLE: 'backend',
        PAPERCLIP_SCOPE_TYPE: 'workstream',
        PAPERCLIP_SCOPE_ID: 'ws-auth',
        PAPERCLIP_PROJECT_NAME: 'demo-project'
      });
    });

    it('workstream 不关联 project 时不注入 PROJECT_NAME', () => {
      const result = builder.buildWorkstreamCommand(
        'prod-001',
        'ms-mvp',
        'ws-auth',
        'backend',
        '实现认证系统'
      );

      expect(result.env.PAPERCLIP_PROJECT_NAME).toBeUndefined();
    });
  });

  describe('buildTaskCommand', () => {
    it('构建 task-scope 命令', () => {
      const result = builder.buildTaskCommand(
        'prod-001',
        'ms-mvp',
        'ws-auth',
        'task-login-api',
        'backend',
        '实现登录 API',
        {
          workingDir: 'E:/projects/demo',
          projectName: 'demo-project',
          acceptanceRef: 'doc/acceptance-matrix.md#登录'
        }
      );

      expect(result.command).toBe('claude');
      expect(result.args).toContain('实现登录 API');
      expect(result.env).toEqual({
        PAPERCLIP_PRODUCT_ID: 'prod-001',
        PAPERCLIP_MILESTONE_ID: 'ms-mvp',
        PAPERCLIP_WORKSTREAM_ID: 'ws-auth',
        PAPERCLIP_TASK_ID: 'task-login-api',
        PAPERCLIP_AGENT_ROLE: 'backend',
        PAPERCLIP_SCOPE_TYPE: 'task',
        PAPERCLIP_SCOPE_ID: 'task-login-api',
        PAPERCLIP_PROJECT_NAME: 'demo-project',
        PAPERCLIP_ACCEPTANCE_REF: 'doc/acceptance-matrix.md#登录'
      });
    });

    it('task 不关联 project 和 acceptanceRef 时不注入', () => {
      const result = builder.buildTaskCommand(
        'prod-001',
        'ms-mvp',
        'ws-auth',
        'task-001',
        'backend',
        '实现功能'
      );

      expect(result.env.PAPERCLIP_PROJECT_NAME).toBeUndefined();
      expect(result.env.PAPERCLIP_ACCEPTANCE_REF).toBeUndefined();
    });
  });

  describe('buildCommand - 通用构建方法', () => {
    it('根据 scopeType=project 自动选择 buildProjectCommand', () => {
      const scope = {
        scopeType: 'project',
        projectName: 'demo'
      };

      const result = builder.buildCommand(scope, 'architect', '设计审查');

      expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe('project');
      expect(result.env.PAPERCLIP_PROJECT_NAME).toBe('demo');
    });

    it('根据 scopeType=milestone 自动选择 buildMilestoneCommand', () => {
      const scope = {
        scopeType: 'milestone',
        productId: 'prod-001',
        milestoneId: 'ms-001'
      };

      const result = builder.buildCommand(scope, 'pm-planner', '拆分任务');

      expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe('milestone');
      expect(result.env.PAPERCLIP_MILESTONE_ID).toBe('ms-001');
    });

    it('根据 scopeType=workstream 自动选择 buildWorkstreamCommand', () => {
      const scope = {
        scopeType: 'workstream',
        productId: 'prod-001',
        milestoneId: 'ms-001',
        workstreamId: 'ws-001'
      };

      const result = builder.buildCommand(scope, 'backend', '实现功能');

      expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe('workstream');
      expect(result.env.PAPERCLIP_WORKSTREAM_ID).toBe('ws-001');
    });

    it('根据 scopeType=task 自动选择 buildTaskCommand', () => {
      const scope = {
        scopeType: 'task',
        productId: 'prod-001',
        milestoneId: 'ms-001',
        workstreamId: 'ws-001',
        taskId: 'task-001'
      };

      const result = builder.buildCommand(scope, 'backend', '实现登录');

      expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe('task');
      expect(result.env.PAPERCLIP_TASK_ID).toBe('task-001');
    });

    it('未知 scopeType 抛出错误', () => {
      const scope = {
        scopeType: 'unknown'
      };

      expect(() => {
        builder.buildCommand(scope, 'backend', '执行任务');
      }).toThrow('Unknown scope type: unknown');
    });
  });

  describe('环境变量注入', () => {
    it('所有 scope 都注入 AGENT_ROLE 和 SCOPE_TYPE', () => {
      const scopes = [
        { scopeType: 'project', projectName: 'demo' },
        { scopeType: 'milestone', productId: 'p1', milestoneId: 'm1' },
        { scopeType: 'workstream', productId: 'p1', milestoneId: 'm1', workstreamId: 'w1' },
        { scopeType: 'task', productId: 'p1', milestoneId: 'm1', workstreamId: 'w1', taskId: 't1' }
      ];

      scopes.forEach(scope => {
        const result = builder.buildCommand(scope, 'test-agent', 'test prompt');
        expect(result.env.PAPERCLIP_AGENT_ROLE).toBe('test-agent');
        expect(result.env.PAPERCLIP_SCOPE_TYPE).toBe(scope.scopeType);
        expect(result.env.PAPERCLIP_SCOPE_ID).toBeDefined();
      });
    });

    it('层级 scope 注入父级 ID', () => {
      const taskScope = {
        scopeType: 'task',
        productId: 'prod-001',
        milestoneId: 'ms-001',
        workstreamId: 'ws-001',
        taskId: 'task-001'
      };

      const result = builder.buildCommand(taskScope, 'backend', 'test');

      expect(result.env.PAPERCLIP_PRODUCT_ID).toBe('prod-001');
      expect(result.env.PAPERCLIP_MILESTONE_ID).toBe('ms-001');
      expect(result.env.PAPERCLIP_WORKSTREAM_ID).toBe('ws-001');
      expect(result.env.PAPERCLIP_TASK_ID).toBe('task-001');
    });
  });
});
