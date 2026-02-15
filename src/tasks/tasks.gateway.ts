import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WebSocketEvents } from '../common/enums/websocket-events.enum';
import { TasksService } from './tasks.service';

/**
 * WebSocket Gateway for real-time task updates
 * Handles Socket.io connections and broadcasts task events to connected clients
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  namespace: '/',
})
export class TasksGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TasksGateway.name);

  constructor(private readonly tasksService: TasksService) {}

  /**
   * Handle new client connection
   */
  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);

    // TODO: Add authentication here
    // Extract token from handshake auth or cookies
    // const token = client.handshake.auth?.token || client.handshake.headers?.cookie;
    // Verify JWT or session token
    // Store user info on client.data.user

    // For now, allow all connections (authentication will be added separately)
    client.data.authenticated = true;
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Client joins a specific task room to receive updates for that task
   */
  @SubscribeMessage(WebSocketEvents.JOIN_TASK)
  async handleJoinTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ): Promise<void> {
    if (!data || !data.taskId) {
      client.emit(WebSocketEvents.ERROR, { message: 'taskId is required' });
      return;
    }

    const { taskId } = data;
    const roomName = `task:${taskId}`;

    this.logger.log(`Client ${client.id} joining task room: ${roomName}`);
    await client.join(roomName);

    // Send current task state to the newly joined client
    try {
      const task = await this.tasksService.findOne(taskId);
      client.emit(WebSocketEvents.TASK_STATE, task);
    } catch (error) {
      this.logger.error(`Error fetching task ${taskId}:`, error);
      client.emit(WebSocketEvents.ERROR, {
        message: 'Failed to fetch task state',
      });
    }
  }

  /**
   * Client leaves a task room
   */
  @SubscribeMessage(WebSocketEvents.LEAVE_TASK)
  async handleLeaveTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ): Promise<void> {
    if (!data || !data.taskId) {
      return;
    }

    const { taskId } = data;
    const roomName = `task:${taskId}`;

    this.logger.log(`Client ${client.id} leaving task room: ${roomName}`);
    await client.leave(roomName);
  }

  /**
   * Client joins dashboard to receive all task updates
   */
  @SubscribeMessage(WebSocketEvents.JOIN_DASHBOARD)
  async handleJoinDashboard(
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.log(`Client ${client.id} joining dashboard room`);
    await client.join('dashboard');

    // Send current dashboard state (task list)
    try {
      const result = await this.tasksService.findAll({ page: 1, limit: 50 });
      client.emit(WebSocketEvents.DASHBOARD_STATE, {
        tasks: result.tasks,
        total: result.total,
      });
    } catch (error) {
      this.logger.error('Error fetching dashboard state:', error);
      client.emit(WebSocketEvents.ERROR, {
        message: 'Failed to fetch dashboard state',
      });
    }
  }

  /**
   * Client leaves dashboard room
   */
  @SubscribeMessage(WebSocketEvents.LEAVE_DASHBOARD)
  async handleLeaveDashboard(
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.log(`Client ${client.id} leaving dashboard room`);
    await client.leave('dashboard');
  }

  /**
   * Client requests state resync after reconnection
   */
  @SubscribeMessage(WebSocketEvents.RESYNC_REQUESTED)
  async handleResyncRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskIds?: string[] },
  ): Promise<void> {
    this.logger.log(`Client ${client.id} requesting resync`);

    if (data?.taskIds && Array.isArray(data.taskIds)) {
      // Resync specific tasks
      for (const taskId of data.taskIds) {
        try {
          const task = await this.tasksService.findOne(taskId);
          client.emit(WebSocketEvents.TASK_STATE, task);
        } catch (error) {
          this.logger.error(`Error resyncing task ${taskId}:`, error);
        }
      }
    } else {
      // Resync dashboard
      try {
        const result = await this.tasksService.findAll({ page: 1, limit: 50 });
        client.emit(WebSocketEvents.DASHBOARD_STATE, {
          tasks: result.tasks,
          total: result.total,
        });
      } catch (error) {
        this.logger.error('Error resyncing dashboard:', error);
      }
    }
  }

  /**
   * Emit task status change to all relevant rooms
   */
  emitTaskStatusChanged(taskId: string, payload: any): void {
    const taskRoom = `task:${taskId}`;
    this.logger.log(`Emitting status change for task ${taskId}`);

    // Emit to task-specific room
    this.server.to(taskRoom).emit(WebSocketEvents.TASK_STATUS_CHANGED, {
      taskId,
      ...payload,
    });

    // Also emit to dashboard room
    this.server.to('dashboard').emit(WebSocketEvents.DASHBOARD_TASK_LIST_UPDATED, {
      taskId,
      ...payload,
    });
  }

  /**
   * Emit new event added to task timeline
   */
  emitTaskEventAdded(taskId: string, event: any): void {
    const taskRoom = `task:${taskId}`;
    this.logger.log(`Emitting new event for task ${taskId}: ${event.eventType}`);

    this.server.to(taskRoom).emit(WebSocketEvents.TASK_EVENT_ADDED, {
      taskId,
      event,
    });
  }

  /**
   * Emit PR update
   */
  emitTaskPrUpdated(taskId: string, payload: any): void {
    const taskRoom = `task:${taskId}`;
    this.logger.log(`Emitting PR update for task ${taskId}`);

    this.server.to(taskRoom).emit(WebSocketEvents.TASK_PR_UPDATED, {
      taskId,
      ...payload,
    });

    // Also update dashboard
    this.server.to('dashboard').emit(WebSocketEvents.DASHBOARD_TASK_LIST_UPDATED, {
      taskId,
      ...payload,
    });
  }

  /**
   * Generic method to emit any task update
   */
  emitTaskUpdate(taskId: string, eventName: string, payload: any): void {
    const taskRoom = `task:${taskId}`;
    this.logger.log(`Emitting ${eventName} for task ${taskId}`);

    // Emit to task-specific room
    this.server.to(taskRoom).emit(eventName, {
      taskId,
      ...payload,
    });

    // Also emit to dashboard if it's a status change
    const statusEvents = [
      WebSocketEvents.TASK_CREATED,
      WebSocketEvents.TASK_ANALYZING,
      WebSocketEvents.TASK_CLARIFICATION_NEEDED,
      WebSocketEvents.TASK_DISPATCHED,
      WebSocketEvents.TASK_CODING,
      WebSocketEvents.TASK_PR_OPENED,
      WebSocketEvents.TASK_PR_MERGED,
      WebSocketEvents.TASK_FAILED,
    ];

    if (statusEvents.includes(eventName as WebSocketEvents)) {
      this.server.to('dashboard').emit(WebSocketEvents.DASHBOARD_TASK_LIST_UPDATED, {
        taskId,
        ...payload,
      });
    }
  }
}
