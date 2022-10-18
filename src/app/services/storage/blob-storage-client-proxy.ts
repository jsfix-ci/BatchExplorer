import { BlobSASPermissions, BlobServiceClient, BlobUploadCommonResponse, ContainerSASPermissions, StorageSharedKeyCredential } from "@azure/storage-blob";
import { EncodingUtils } from "@batch-flask/utils";
import { BlobStorageResult, SharedAccessPolicy, StorageRequestOptions } from "./models";

export type StorageBlobResponse = BlobUploadCommonResponse;

export interface ListBlobOptions {
    /**
     * Filter for the path.(Relative to the prefix if given)
     */
    folder?: string;

    /**
     * If it should list all files or 1 directory deep.
     */
    recursive?: boolean;

    limit?: number;
}

export interface ListBlobResponse {
    body: {
        EnumerationResults: {
            Blobs: {
                Blob: any | any[],
                BlobPrefix: any | any[],
            },
        },
    };
}

export class BlobStorageClientProxy {

    private storageService: BlobServiceClient;

    constructor(
        private credential: StorageSharedKeyCredential,
        private blobEndpoint: string
    ) {
        this.storageService = new BlobServiceClient(
            `https://${credential.accountName}.${blobEndpoint}`,
            credential
        );
    }

    /**
     * Lists blobs from the container that match the prefix. In our case the
     * prefix will be the taskId and the OutputKind of the task output.
     *
     * @param {string} container - Name of the storage container
     * @param {string} blobPrefix - The prefix of the blob name. In our case it is the taskId prefix:
     *  "${taskId}/$TaskOutput|$TaskLog/${namePrefixFilter}"
     * @param {string} filter - Optional text for filtering further than the blob prefix
     * @param {string} continuationToken - Token that was returned from the last call, if any
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async listBlobs(
        container: string,
        options: ListBlobOptions = {},
        continuationToken?: any
    ): Promise<BlobStorageResult> {

        const prefix = options.folder;
        const delimiter = options.recursive ? null : "/";

        const client = this.getContainerClient(container);

        const blobs = [];
        const pages = client.listBlobsByHierarchy(delimiter, { prefix })
            .byPage({ continuationToken, maxPageSize: options.limit });

        for await (const page of pages) {
            const segment = page.segment;
            for (const prefix of segment.blobPrefixes) {
                blobs.push({
                    name: prefix.name,
                    url: `${container}/${prefix.name}`,
                    isDirectory: true
                });
            }
            for (const blob of segment.blobItems) {
                blobs.push({
                    name: blob.name,
                    url: `${container}/${blob.name}`,
                    isDirectory: false,
                    properties: {
                        contentLength: blob.properties.contentLength,
                        contentType: blob.properties.contentType,
                        creationTime: null,
                        lastModified: blob.properties.lastModified,
                    }
                });
            }
        }

        return { data: blobs, continuationToken };
    }

    /**
     * Returns all user-defined metadata, standard HTTP properties, and system
     * properties for the blob.
     *
     * @param {string} container - Name of the storage container
     * @param {string} blobName - Name of the blob file: "myblob.txt"
     * @param {string} blobPrefix - Optional prefix to the blob from the container root: "1001/$TaskOutput/"
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async getBlobProperties(
        container: string,
        blobName: string,
        blobPrefix = "",
        options?: StorageRequestOptions
    ): Promise<BlobStorageResult> {

        const client = this.getBlobClient(container, blobName);
        const blobPath = blobPrefix + blobName;
        const props = await client.getProperties(options);

        return {
            data: {
                name: blobName,
                url: `${container}/${blobPath}`,
                isDirectory: false,
                properties: {
                    contentLength: props.contentLength,
                    contentType: props.contentType,
                    creationTime: null,
                    lastModified: props.lastModified,
                },
            },
        };
    }

    /**
     * Downloads a blob into a text string.
     *
     * @param {string} container - Name of the storage container
     * @param {string} blob - Fully prefixed blob path: "1001/$TaskOutput/myblob.txt"
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async getBlobContent(container: string, blob: string, options?: StorageRequestOptions) {
        const buffer = await this._getBlobAsBuffer(container, blob, options);
        const { encoding } = await EncodingUtils.detectEncodingFromBuffer({ buffer, bytesRead: buffer.length });
        let content;
        if (encoding) {
            content = new TextDecoder(encoding).decode(buffer);
        } else {
            content = buffer.toString();
        }

        return { content };
    }

    /**
     * Downloads a blob into a file.
     *
     * @param {string} container - Name of the storage container
     * @param {string} blob - Fully prefixed blob path: "1001/$TaskOutput/myblob.txt"
     * @param {string} localFileName - The local path to the file to be downloaded.
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async getBlobToLocalFile(
        container: string,
        blob: string,
        localFileName: string,
        options?: StorageRequestOptions
    ): Promise<void> {
        const client = this.getBlobClient(container, blob);
        await client.downloadToFile(localFileName, undefined, undefined,
            options);
        return;
    }

    /**
     * Marks the specified blob or snapshot for deletion if it exists. The blob
     * is later deleted during garbage collection. If a blob has snapshots, you
     * must delete them when deleting the blob by setting the deleteSnapshots
     * option.
     *
     * @param {string} container - ID of the storage container
     * @param {string} blob - Fully prefixed blob path: "1001/$TaskOutput/myblob.txt"
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async deleteBlobIfExists(container: string, blob: string, options?: StorageRequestOptions)
        : Promise<boolean> {

        const client = this.getBlobClient(container, blob);
        const response = await client.deleteIfExists(options);
        return response.succeeded;
    }

    /**
     * Lists a segment containing a collection of container items whose names
     * begin with the specified prefix under the specified account. By default
     * the prefix will generally be "grp-" as this is the NCJ prefix for file
     * group containers, but can aso be anything we like in order to get any
     * arbitrary container.
     *
     * @param {string} prefix - Container name prefix including filter, or null.
     * @param {string} continuationToken - Token that was returned from the last call, if any
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async listContainersWithPrefix(
        prefix: string,
        continuationToken?: any,
        options?: StorageRequestOptions
    ): Promise<BlobStorageResult> {

        const containers = []
        const pages = this.storageService
            .listContainers({ prefix, ...options })
            .byPage(continuationToken);
        for await (const page of pages) {
            for (const container of page.containerItems) {
                containers.push({
                    ...container,
                    id: container.name
                });
            }
        }
        return {
            data: containers,
            continuationToken
        };
    }

    /**
     * Returns all user-defined metadata and system properties for the
     * specified container. The data returned does not include the container's
     * list of blobs.
     *
     * @param {string} container - Name of the storage container
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async getContainerProperties(
        container: string,
        options?: StorageRequestOptions
    ): Promise<BlobStorageResult> {

        const client = this.getContainerClient(container);
        const response = await client.getProperties(options);

        return { data: response };
    }

    /**
     * Marks the specified container for deletion. The container and any blobs
     * contained within it are later deleted during garbage collection.
     *
     * @param {string} container - Name of the storage container
     * @param {StorageRequestOptions} options - Optional request parameters
     */
    public async deleteContainer(
        container: string,
        options?: StorageRequestOptions
    ): Promise<void> {
        await this.storageService.deleteContainer(container, options);
        return;
    }

    /**
     * Creates a new container under the specified account.
     * If a container with the same name already exists, the operation fails.
     *
     * @param {string} container - Name of the storage container
     */
    public async createContainer(containerName: string): Promise<void> {
        await this.storageService.createContainer(containerName);
        return;
    }

    /**
     * Creates a new container under the specified account if it doesn't exists.
     *
     * @param {string} container - Name of the storage container
     * @returns {boolean} whether a new container was created
     */
    public async createContainerIfNotExists(
        containerName: string,
        options?: StorageRequestOptions
    ): Promise<boolean> {
        const client = this.getContainerClient(containerName);
        const response = await client.createIfNotExists(options);
        return response.succeeded;
    }

    public async generateSasUrl(
        container: string,
        blob?: string,
        accessPolicy?: SharedAccessPolicy
    ): Promise<string> {
        const permissions = accessPolicy.AccessPolicy.Permissions;
        if (blob) {
            return this.getBlobClient(container, blob).generateSasUrl({
                permissions: BlobSASPermissions.parse(permissions)
            });
        } else {
            return this.getContainerClient(container).generateSasUrl({
                permissions: ContainerSASPermissions.parse(permissions)
            });
        }
    }

    /**
     * Retrieves a blob or container URL.
     *
     * @param {string} container - Name of the storage container
     * @param {string} blob - Optional blob name.
     * @param {string} sasToken - The Shared Access Signature token.
     */
    public getUrl(container: string, blob?: string, sasToken?: string): string {
        return [
            `https://${this.credential.accountName}.${this.blobEndpoint}`,
            container,
            blob ? `/${blob}${sasToken}` : sasToken
        ].join("/");
    }

    public async uploadFile(container: string, file: string, blobName: string): Promise<StorageBlobResponse> {
        return this.getBlobClient(container, blobName).uploadFile(file);
    }

    private getContainerClient(container: string) {
        return this.storageService.getContainerClient(container);
    }

    private getBlobClient(container: string, blobName: string) {
        return this.getContainerClient(container).getBlockBlobClient(blobName);
    }

    private _getBlobAsBuffer(container: string, blob: string, options: StorageRequestOptions): Promise<Buffer> {
        return this.getBlobClient(container, blob)
            .downloadToBuffer(0, null, options);
    }
}
