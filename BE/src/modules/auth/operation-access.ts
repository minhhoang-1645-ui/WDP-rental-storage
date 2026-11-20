import { SetMetadata } from '@nestjs/common';

/** Staff owns operational workflows; old Manager GET URLs remain for reporting. */
export const StaffWorkflow = () => SetMetadata('staffWorkflow', true);
/** Shared read-only context for selecting a unit/contract during an operation. */
export const StaffLookup = () => SetMetadata('staffLookup', true);
/** Assigning employees remains a Manager responsibility. */
export const ManagerAssignment = () => SetMetadata('managerAssignment', true);
