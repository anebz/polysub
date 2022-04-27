import React, { Component } from 'react';
import './App.css';
import axios from 'axios'

//function App() {
class App extends Component {

  state = {
    // Initially, no file is selected
    selectedFile: null,
    fileUploadedSuccessfully: false,
    APIResult: ""
  };

  onFileChange = event => {
    this.setState({ selectedFile: event.target.files[0] });
  }

  onFileUpload = () => {
    const formData = new FormData();
    formData.append(
      "demo files",
      this.state.selectedFile,
      this.state.selectedFile.name
    )
    // call api to upload file
    console.log(`${process.env.REACT_APP_ENDPOINT}translate`)
    axios.post(`${process.env.REACT_APP_ENDPOINT}translate`, formData).then(response => {
      console.log(response.data.result);
      this.setState({ selectedFile: false })
      this.setState({ fileUploadedSuccessfully: true });
    })
  }

  fileData = () => {
    if (this.state.selectedFile) {
      return (
        <div>
          <h2>File Details:</h2>
          <p>File Name: {this.state.selectedFile.name}</p>
          <p> File Type: {this.state.selectedFile.type}</p>
        </div>
      )
    } else if (this.state.fileUploadedSuccessfully) {
      return (
        <div>
          <br />
          <h4>Your file has been successfully uploaded</h4>
        </div>
      )
    } else {
      return (
        <div>
          <br />
          <h4> Choose a file and press the Upload button</h4>
        </div>
      )
    }
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Translate subtitle files 🎥</h1>
          <div>
            <h3>Upload your file here</h3>
            <div>
              <input type="file" onChange={this.onFileChange} />
              <button onClick={this.onFileUpload}>Upload</button>
            </div>
            {this.fileData()}
          </div>
        </header>
      </div>
    );
  }
}

export default App;