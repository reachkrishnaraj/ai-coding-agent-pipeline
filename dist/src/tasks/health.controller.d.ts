import { TasksService } from './tasks.service';
export declare class HealthController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    check(): Promise<{
        status: string;
        db: string;
        error?: undefined;
    } | {
        status: string;
        db: string;
        error: any;
    }>;
}
