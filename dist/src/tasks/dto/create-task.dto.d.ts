export declare class CreateTaskDto {
    description: string;
    type?: string;
    repo?: string;
    files?: string;
    acceptanceCriteria?: string;
    priority?: 'normal' | 'urgent';
    source?: string;
    createdBy?: string;
}
