const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Use python3 for Docker/Linux, or python/python3 for local development
const pythonPath = process.env.PYTHON_PATH || (os.platform() === 'win32' ? 'python' : 'python3');

function analyzeSentimentWithPython(text) {
	return new Promise((resolve, reject) => {
		const pythonScript = path.join(__dirname, '..', 'python', 'sentiment_nb_spacy.py');
		const py = spawn(pythonPath, [pythonScript], {
			cwd: path.join(__dirname, '..', 'python') // Set working directory to python folder
		});
		let result = '';
		let error = '';
		
		py.stdout.on('data', (data) => {
			result += data.toString();
		});
		
		py.stderr.on('data', (data) => {
			error += data.toString();
		});
		
		py.on('close', (code) => {
			console.log('Python script exit code:', code);
			console.log('Python stdout:', result);
			console.log('Python stderr:', error);
			
			if (code !== 0) {
				return reject(`Python script failed with exit code ${code}. Error: ${error}`);
			}
			
			if (error && !result) {
				return reject(error);
			}
			
			try {
				// Extract JSON from the result (there might be other output)
				const lines = result.split('\n');
				let jsonResult = '';
				
				// Find the last line that looks like JSON
				for (let i = lines.length - 1; i >= 0; i--) {
					const line = lines[i].trim();
					if (line.startsWith('{') && line.endsWith('}')) {
						jsonResult = line;
						break;
					}
				}
				
				if (!jsonResult) {
					throw new Error('No JSON output found');
				}
				
				const output = JSON.parse(jsonResult);
				resolve(output);
			} catch (e) {
				reject('Failed to parse Python output: ' + result + '. Parse error: ' + e.message);
			}
		});
		
		py.on('error', (err) => {
			reject('Failed to start Python process: ' + err.message);
		});
		
		// Write input and close stdin
		try {
			py.stdin.write(JSON.stringify({ text }));
			py.stdin.end();
		} catch (err) {
			reject('Failed to write to Python process: ' + err.message);
		}
	});
}

module.exports = { analyzeSentimentWithPython };
