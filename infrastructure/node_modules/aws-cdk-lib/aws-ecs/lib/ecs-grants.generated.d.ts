import * as ecs from "./ecs.generated";
import * as iam from "aws-cdk-lib/aws-iam";
/**
 * Collection of grant methods for a IClusterRef
 */
export declare class ClusterGrants {
    /**
     * Creates grants for ClusterGrants
     */
    static fromCluster(resource: ecs.IClusterRef): ClusterGrants;
    protected readonly resource: ecs.IClusterRef;
    private constructor();
    /**
     * Grants an ECS Task Protection API permission to the specified grantee.
     * This method provides a streamlined way to assign the 'ecs:UpdateTaskProtection'
     * permission, enabling the grantee to manage task protection in the ECS cluster.
     */
    taskProtection(grantee: iam.IGrantable): iam.Grant;
}
