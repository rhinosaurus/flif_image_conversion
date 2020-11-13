const express = require('express');
const busboy = require('connect-busboy');
const path = require('path');
const fs = require('fs');
const flif = require('node-flif');
const jimp = require('jimp');
const mozjpeg = require('mozjpeg');
const { execFile } = require('child_process');

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(busboy({
  highWaterMark: 5 * 1024 * 1024,
}));

const convertToPng = async (file, filename) => {
  console.log('Converting to PNG');

  return new Promise(resolve => {
    const f = file.replace(/\.(jpg|jpeg)/,`_${Date.now()}.png`);
    jimp.read(file).then(tmp => {
      tmp.write(f, () => {
        console.log('Convert to PNG complete');
        resolve([f, filename.replace(/jpg|jpeg/, 'png')]);
      });
    });
  });
};

const compress = (file, filename) => {
  const flifName = `${filename}_${Date.now()}.flif`;
  const encodeParams = {
    input: file,
    output: path.join(__dirname, `uploads/${flifName}`),
    async: false,
    encodeQuality: 80,
    effort: 20
  };
  flif.encode(encodeParams);

  return flifName;
};

const saveFile = (file, filename) => {
  return new Promise((resolve, reject) => {
    const fstream = fs.createWriteStream(path.join('/tmp', filename));
    file.pipe(fstream);
    fstream.on('close', resolve);
  });
};

app.route('/upload').post((req, res, next) => {

  let realFilename, temp;

  req.pipe(req.busboy);

  req.busboy.on('file', async (fieldname, file, filename) => {
    temp = `/tmp/${filename}`;
    realFilename = filename;
    console.log(`Upload of '${filename}' started`);

    await saveFile(file, filename);

    console.log(`Upload of '${filename}' finished`);

    if( realFilename.match(/\.(jpg|jpeg)/) !== null ) {
      ([temp, realFilename] = await convertToPng(temp, realFilename));
    }

    console.log('Compressing...');

    const outFile = compress(temp, realFilename);

    console.log('done compressing.');

    const origStats = fs.statSync(temp);
    const stats = fs.statSync(`uploads/${outFile}`);

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: arial; }
          </style>
        </head>
        <body>
          <p>
            Original size: ${Math.round(origStats.size/(1024))}kb<br>
            Flif size: ${Math.round(stats.size/(1024))}kb
          </p>
          <p>
            Use http://localhost:3000/fit/width/height/${outFile}, For example:
          </p>
          <p>
            http://localhost:3000/fit/200/200/${outFile}<br>
            <img src="http://localhost:3000/fit/200/200/${outFile}">
          </p>
          <p>
            scaled version:<br>
            http://localhost:3000/scaled/2/${outFile}<br>
            <img src="http://localhost:3000/scaled/2/${outFile}">
          </p>
        </body>
      </html>
    `);
  });
});

const decode = (opts = {}, req) => {
  let outFile;
  if( opts.fit ) {
    outFile = `/tmp/${opts.fit.width}_${opts.fit.height}_${req.params.file.replace(/(.*\.png)(.*)/, "$1")}`;
  } else if ( opts.scale ) {
    outFile = `/tmp/${opts.scale}_${req.params.file.replace(/(.*\.png)(.*)/, "$1")}`;
  }

  if( fs.existsSync(outFile) ) {
    return outFile;
  }

  const decodeParams = {
    input: path.join(__dirname, `uploads/${req.params.file}`),
    output: outFile,
    async: false,
    ...opts
  };
  flif.decode(decodeParams);
  return outFile;
};

app.get('/scaled/:scale/:file', (req, res) => {
  const { scale } = req.params;
  const out = decode({ scale: parseInt(scale, 10) }, req);

  res.sendFile(out);
});

app.get('/fit/:width/:height/:file', (req, res) => {
  const { width, height } = req.params;
  const out = decode({ fit: { width, height } }, req);
  res.sendFile(out);
});

const compressMozJpeg = (temp, filename) => {
  const f = `${Date.now()}_${filename}`;

  return new Promise(resolve => {
    execFile(mozjpeg, ['-outfile', `uploads/${f}`, temp], err => {
      resolve(f);
    });
  });
};

app.route('/upload-mozjpeg').post((req, res, next) => {
  let realFilename, temp;

  req.pipe(req.busboy);

  req.busboy.on('file', async (fieldname, file, filename) => {
    temp = `/tmp/${filename}`;
    realFilename = filename;
    console.log(`Upload of '${filename}' started`);

    await saveFile(file, filename);

    console.log('Compressing...');

    const outFile = await compressMozJpeg(temp, realFilename);

    console.log('done compressing.');

    const origStats = fs.statSync(temp);
    const stats = fs.statSync(`uploads/${outFile}`);

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: arial; }
          </style>
        </head>
        <body>
          <p>
            Original size: ${Math.round(origStats.size/(1024))}kb<br>
            Mozjpeg size: ${Math.round(stats.size/(1024))}kb
          </p>
        </body>
      </html>
    `);
  });
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
});
