import './App.css';
import React, { Component } from 'react';

const langs = {
  'en': ['de', 'zh', 'fr', 'es', 'eu', 'el', 'ru', 'ar', 'jap', 'it', 'nl', 'ro'],
  'es': ['en', 'de', 'fr', 'eu'],
  'de': ['en', 'fr', 'es', 'eu'],
  'fr': ['en', 'de', 'es'],
  'it': ['en', 'de', 'fr'],
  'eu': ['es', 'en', 'de'],
  'zh': ['en'],
  'ru': ['en'],
  'jap': ['en']
}

const lang_mapping = {
  'en': 'English',
  'es': 'Spanish',
  'de': 'German',
  'fr': 'French',
  'it': 'Italian',
  'eu': 'Basque',
  'zh': 'Chinese',
  'ru': 'Russian',
  'jap': 'Japanese',
  'el': 'Greek',
  'ar': 'Arabic',
  'nl': 'Dutch',
  'ro': 'Romanian'
}

class App extends Component {

  state = {
    selectedFile: null,
    incorrectExtension: false,
    langSource: "",
    langTarget: "",
    buttonClicked: false,
    APIResult: ""
  };

  onFileChange = event => {
    this.setState({ APIResult: "" });
    if (event.target.files[0] !== undefined) {
      const extension = event.target.files[0].name.split('.').pop();
      this.setState({ incorrectExtension: extension !== 'srt' });
      this.setState({ selectedFile: event.target.files[0] });
    } else {
      this.setState({ selectedFile: null });
      this.setState({ incorrectExtension: false });
    }
  }

  onLangSourceChange = (event) => {
    this.setState({ buttonClicked: false });

    this.setState({ APIResult: "" });
    if (event.target.value === "What language are your subtitles in?") {
      this.setState({ langSource: "" });
    } else {
      this.setState({ langSource: event.target.value });
    }
  }

  showlangTargets = () => {
    if (this.state.langSource) {
      return (
        <select onChange={this.onlangTargetChange}>
          <option value="What language do you want to translate your subtitles into?"> Select target language </option>
          {langs[this.state.langSource].map((lang) => <option key={lang} value={lang}>{lang_mapping[lang]}</option>)}
        </select>
      )
    }
  }

  onlangTargetChange = (event) => {
    this.setState({ buttonClicked: false });
    this.setState({ langTarget: event.target.value });
  }

  onFileUpload = async () => {

    if (!this.state.selectedFile || this.state.incorrectExtension || !this.state.langSource || !this.state.langTarget) {
      return
    }

    this.setState({ buttonClicked: true });
    this.setState({ APIResult: null });

    const formData = new FormData();
    formData.append("lang_source", `XX_${this.state.langSource}_XX`);
    formData.append("lang_target", `XX_${this.state.langTarget}_XX`);
    formData.append("User file", this.state.selectedFile, this.state.selectedFile.name);

    // call api to upload file
    const config = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: formData
    };
    try {
      const fetchResponse = await fetch(`${process.env.REACT_APP_ENDPOINT}`, config);
      const data = await fetchResponse.json();
      if (fetchResponse.ok) {
        console.log(fetchResponse);
        console.log(data);
        this.setState({ buttonClicked: false });
        this.setState({ APIResult: data.result });
      } else {
        this.setState({ buttonClicked: false });
        this.setState({ APIResult: 'ERROR in response' });
      }
    } catch (error) {
      console.log(error);
      this.setState({ buttonClicked: false });
      this.setState({ APIResult: 'ERROR in request' });
    }
  }

  fileData = () => {
    if (this.state.APIResult) {
      if (this.state.APIResult.includes('ERROR')) {
        return (
          <div>
            <br />
            <h4>😔 There has been an error translating your file</h4>
          </div>
        )
      } else {
        return (
          <div>
            <br />
            <h4>File translated successfully! 🥳</h4>
            <button onClick={() => { window.open(this.state.APIResult, "_blank"); }}>
              Download your translated file
            </button>
          </div>
        )
      }
    } else if (!this.state.selectedFile) {
      return (
        <div>
          <br />
          <h4> Choose a file and press the Translate button</h4>
        </div>
      )
    } else if (!this.state.langSource || !this.state.langTarget) {
      return (
        <div>
          <p>Please select a source language and target language</p>
        </div>
      )
    } else if (this.state.buttonClicked) {
      if (this.state.incorrectExtension) {
        return (
          <div>
            <p>❌ ERROR: Your file extension is not .srt --{'>'} Please upload a valid file!</p>
          </div>
        )
      }
      return (
        <div>
          <h4>🚛 Translating...</h4>
          <p>🕰 This might take a few minutes to run. Please don't exit or refresh the webpage</p>
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
            </div>
            <div>
              <select onChange={this.onLangSourceChange}>
                <option value="What language are your subtitles in?"> Select origin language </option>
                {Object.keys(langs).map((lang) => <option key={lang} value={lang}>{lang_mapping[lang]}</option>)}
              </select>
              {this.showlangTargets()}
            </div>
            <div>
              <button onClick={this.onFileUpload}>Translate subtitles</button>
            </div>
            {this.fileData()}
          </div>
        </header>
      </div>
    );
  }
}

export default App;