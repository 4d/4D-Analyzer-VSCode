import * as fs from 'fs/promises'

const copyFastDecompress = async () => {
  await fs.cp('./node_modules/@gkotulski/', './out/node_modules/@gkotulski/', {
    recursive: true
  })

}

copyFastDecompress()