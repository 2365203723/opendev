const path = require('path');

/**
 * 构建 Claude Code 执行命令
 */
function createCommandBuilder() {
  /**
   * 构建 project-scope 命令（兼容旧流程）
   */
  function buildProjectCommand(projectName, agentRole, prompt, options = {}) {
    const {
      workingDir,
      agentFile,
      model = 'claude-sonnet-4-6',
      timeout = 3600000
    } = options;

    const args = [];

    // 工作目录
    if (workingDir) {
      args.push('--cwd', workingDir);
    }

    // Agent 配置文件
    if (agentFile) {
      args.push('--agent', agentFile);
    }

    // 模型
    args.push('--model', model);

    // 超时
    args.push('--timeout', timeout.toString());

    // Prompt
    args.push(prompt);

    return {
      command: 'claude',
      args,
      env: {
        PAPERCLIP_PROJECT_NAME: projectName,
        PAPERCLIP_AGENT_ROLE: agentRole,
        PAPERCLIP_SCOPE_TYPE: 'project',
        PAPERCLIP_SCOPE_ID: projectName
      }
    };
  }

  /**
   * 构建 milestone-scope 命令
   */
  function buildMilestoneCommand(productId, milestoneId, agentRole, prompt, options = {}) {
    const {
      workingDir,
      agentFile,
      model = 'claude-sonnet-4-6',
      timeout = 3600000
    } = options;

    const args = [];

    if (workingDir) {
      args.push('--cwd', workingDir);
    }

    if (agentFile) {
      args.push('--agent', agentFile);
    }

    args.push('--model', model);
    args.push('--timeout', timeout.toString());
    args.push(prompt);

    return {
      command: 'claude',
      args,
      env: {
        PAPERCLIP_PRODUCT_ID: productId,
        PAPERCLIP_MILESTONE_ID: milestoneId,
        PAPERCLIP_AGENT_ROLE: agentRole,
        PAPERCLIP_SCOPE_TYPE: 'milestone',
        PAPERCLIP_SCOPE_ID: milestoneId
      }
    };
  }

  /**
   * 构建 workstream-scope 命令
   */
  function buildWorkstreamCommand(productId, milestoneId, workstreamId, agentRole, prompt, options = {}) {
    const {
      workingDir,
      agentFile,
      model = 'claude-sonnet-4-6',
      timeout = 3600000,
      projectName
    } = options;

    const args = [];

    if (workingDir) {
      args.push('--cwd', workingDir);
    }

    if (agentFile) {
      args.push('--agent', agentFile);
    }

    args.push('--model', model);
    args.push('--timeout', timeout.toString());
    args.push(prompt);

    const env = {
      PAPERCLIP_PRODUCT_ID: productId,
      PAPERCLIP_MILESTONE_ID: milestoneId,
      PAPERCLIP_WORKSTREAM_ID: workstreamId,
      PAPERCLIP_AGENT_ROLE: agentRole,
      PAPERCLIP_SCOPE_TYPE: 'workstream',
      PAPERCLIP_SCOPE_ID: workstreamId
    };

    // 如果 workstream 关联了 project，注入 project 信息
    if (projectName) {
      env.PAPERCLIP_PROJECT_NAME = projectName;
    }

    return {
      command: 'claude',
      args,
      env
    };
  }

  /**
   * 构建 task-scope 命令
   */
  function buildTaskCommand(productId, milestoneId, workstreamId, taskId, agentRole, prompt, options = {}) {
    const {
      workingDir,
      agentFile,
      model = 'claude-sonnet-4-6',
      timeout = 3600000,
      projectName,
      acceptanceRef
    } = options;

    const args = [];

    if (workingDir) {
      args.push('--cwd', workingDir);
    }

    if (agentFile) {
      args.push('--agent', agentFile);
    }

    args.push('--model', model);
    args.push('--timeout', timeout.toString());
    args.push(prompt);

    const env = {
      PAPERCLIP_PRODUCT_ID: productId,
      PAPERCLIP_MILESTONE_ID: milestoneId,
      PAPERCLIP_WORKSTREAM_ID: workstreamId,
      PAPERCLIP_TASK_ID: taskId,
      PAPERCLIP_AGENT_ROLE: agentRole,
      PAPERCLIP_SCOPE_TYPE: 'task',
      PAPERCLIP_SCOPE_ID: taskId
    };

    if (projectName) {
      env.PAPERCLIP_PROJECT_NAME = projectName;
    }

    if (acceptanceRef) {
      env.PAPERCLIP_ACCEPTANCE_REF = acceptanceRef;
    }

    return {
      command: 'claude',
      args,
      env
    };
  }

  /**
   * 通用构建方法（根据 scope 自动选择）
   */
  function buildCommand(scope, agentRole, prompt, options = {}) {
    const { scopeType } = scope;

    switch (scopeType) {
      case 'project':
        return buildProjectCommand(scope.projectName, agentRole, prompt, options);

      case 'milestone':
        return buildMilestoneCommand(
          scope.productId,
          scope.milestoneId,
          agentRole,
          prompt,
          options
        );

      case 'workstream':
        return buildWorkstreamCommand(
          scope.productId,
          scope.milestoneId,
          scope.workstreamId,
          agentRole,
          prompt,
          options
        );

      case 'task':
        return buildTaskCommand(
          scope.productId,
          scope.milestoneId,
          scope.workstreamId,
          scope.taskId,
          agentRole,
          prompt,
          options
        );

      default:
        throw new Error(`Unknown scope type: ${scopeType}`);
    }
  }

  return {
    buildProjectCommand,
    buildMilestoneCommand,
    buildWorkstreamCommand,
    buildTaskCommand,
    buildCommand
  };
}

module.exports = { createCommandBuilder };
