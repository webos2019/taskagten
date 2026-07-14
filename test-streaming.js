import { useStreamTextBuffer } from './hooks/useStreamTextBuffer';

// Test if streaming works with simple text chunks
console.log('Testing stream text buffer...');

// Test data
const testChunks = [
  { type: 'text', content: 'Hello ' },
  { type: 'text', content: 'world!' },
  { type: 'done' }
];

console.log('Test chunks:', testChunks);
console.log('If this shows, the module loads correctly');