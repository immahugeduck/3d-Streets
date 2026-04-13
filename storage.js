const { BlobServiceClient } = require('@azure/storage-blob');

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

// Function to save routes
async function saveRoute(route) {
    const containerClient = blobServiceClient.getContainerClient('routes');
    const blobName = `route-${Date.now()}.json`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(JSON.stringify(route), Buffer.byteLength(JSON.stringify(route)));
    return blobName;
}

// Function to get all stored routes
async function getRoutes() {
    const containerClient = blobServiceClient.getContainerClient('routes');
    const blobs = containerClient.listBlobsFlat();
    const routes = [];
    for await (const blob of blobs) {
        const blobClient = containerClient.getBlobClient(blob.name);
        const downloadBlockBlobResponse = await blobClient.download();
        const data = await streamToString(downloadBlockBlobResponse.readableStreamBody);
        routes.push(JSON.parse(data));
    }
    return routes;
}

// Helper function to convert stream to string
async function streamToString(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk.toString());
    }
    return chunks.join('');
}

module.exports = { saveRoute, getRoutes };