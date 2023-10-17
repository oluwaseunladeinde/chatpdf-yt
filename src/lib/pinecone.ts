import { Pinecone, Vector, utils as PineconeUtils } from '@pinecone-database/pinecone';
import { downloadFromS3 } from './s3-server';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { Document, RecursiveCharacterTextSplitter } from '@pinecone-database/doc-splitter';
import { getEmbeddings } from './embeddings';
import md5 from 'md5';
import { convertToAscii } from './utils';

//let pinecone: Pinecone | null = null

type DocMetadata = {
    text: string,
    pageNumber: number,
}

export async function configurePinecone(index_name: string){
    const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
        environment: process.env.PINECONE_ENVIRONMENT!,
    });
    
    const new_index = await pinecone.createIndex({
        name: index_name,
        dimension: 1536,
        suppressConflicts: true, // This option tells the client not to throw if the index already exists.
        waitUntilReady: true, // This option tells the client not to resolve the promise until the index is ready.
    });

    const describe_index = await pinecone.describeIndex(index_name);
    const indexes = await pinecone.listIndexes();
}



export const getPineconeClient = async() => {
    const pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY!,
        environment: process.env.PINECONE_ENVIRONMENT!,
    });

    //const list = await pinecone.listIndexes();
    //console.log("Pinecone indexes ",list);

    return pinecone;
}

type PDFPage = {
    pageContent: string,
    metadata: {
        loc: {pageNumber: number}
    }
}

export async function loadS3IntoPinecone(fileKey:string){
    // 1. Obtain the PDF -> download and read from PDF
    console.log('downloading s3 into local file system');
    const file_name = await downloadFromS3(fileKey);
    if(!file_name){
        throw new Error('could notoa d from s3!');
    }

    const loader = new PDFLoader(file_name);
    const pages = (await loader.load()) as PDFPage[];

    //2. Split and segment the PDF into smaller documents
    const documents = await Promise.all(pages.map(prepareDocumnet));

    //3. Vectorise and embed individual documents
    const vectors = await Promise.all(documents.flat().map(embedDocument));

    //4. upload to pinecone
    const client = await getPineconeClient();

    //const pineconeIndex = client.index<DocMetadata>('chatpdf-yti'); //.namespace(namespace);
    const pineconeIndex = client.index('chatpdf-yti');

    console.log('inserting vectors into pinecone');
    const namespace = convertToAscii(fileKey);

    pineconeIndex.upsert(vectors);

    console.log('loaded into pinecode successfully')

    return documents[0];
}

export const truncateStringByBytes = (str: string, bytes: number) => {
    const enc = new TextEncoder();
    return new TextDecoder('utf-8').decode(enc.encode(str).slice(0, bytes));
}

async function embedDocument(doc: Document){
    try {
        const doc_hash = md5(doc.pageContent);
        const doc_embeddings = await getEmbeddings(doc.pageContent);
        const doc_text: string | any = doc.metadata.text;
        const doc_pageNumber: number | any = doc.metadata.text;

        return {
            id: doc_hash,
            values: doc_embeddings,
            metadata: {
                text: doc_text,
                pageNumber: doc_pageNumber,
            }
        };
    } catch (error) {
        console.log('error embedding document', error);
        throw error;
    }
}

async function prepareDocumnet(page: PDFPage){
    let {pageContent, metadata} = page
    pageContent = pageContent.replace(/\n/g, '')
    //split the docs
    const splitter = new RecursiveCharacterTextSplitter()
    const docs = await splitter.splitDocuments([
        new Document({
            pageContent,
            metadata: {
                pageNumber: metadata.loc.pageNumber,
                text: truncateStringByBytes(pageContent, 36000),
            }
        })
    ])
    return docs;
}