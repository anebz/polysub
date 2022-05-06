import './App.css';
import axios from 'axios'
import React, { Component } from 'react';
import Analytics from '@aws-amplify/analytics';
import Auth from '@aws-amplify/auth';

const amplifyConfig = {
  Auth: {
    identityPoolId: 'us-east-1:fcd726d1-8fe0-4cf0-bd81-8ffddd5bf0c0',
    region: 'eu-central-1'
  }
}

//Initialize Amplify
Auth.configure(amplifyConfig);

const analyticsConfig = {
  AWSPinpoint: {
    // Amazon Pinpoint App Client ID
    appId: 'f86e1c35ee144fb8a9c6a932bf3a2038',
    // Amazon service region
    region: 'eu-central-1',
    mandatorySignIn: false,
  }
}

Analytics.configure(analyticsConfig)

// session tracking
// https://catalog.us-east-1.prod.workshops.aws/workshops/bb080ee8-4722-4290-ac6e-d4cde0a65142/en-US/03-adding-analytics/01-collect-analytics#session-tracking
Analytics.autoTrack('session', {
  enable: true
});

// page view tracking
Analytics.autoTrack('pageView', {
  enable: true,
  type: 'SPA'
});

// page event tracking
Analytics.autoTrack('event', {
  enable: true
});


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
    fileUploadedSuccessfully: false,
    APIResult: "",
    origLang: "",
    targetLang: ""
  };

  onFileChange = event => {
    this.setState({ selectedFile: event.target.files[0] });
  }

  onFileUpload = () => {

    // create Analytics record: https://docs.amplify.aws/lib/analytics/autotrack/q/platform/js/#page-event-tracking
    Analytics.record({
      name: 'click',
      attributes: {
        attr: 'attr', // the default ones
        orig_lang: this.state.origLang, // defined in the button component
        target_lant: this.state.targetLang, // defined in the button component
      }
    });

    const formData = new FormData();
    formData.append("origin_lang", `XX_${this.state.origLang}_XX`);
    formData.append("target_lang", `XX_${this.state.targetLang}_XX`);
    formData.append("User file", this.state.selectedFile, this.state.selectedFile.name);

    // call api to upload file
    axios.post(`${process.env.REACT_APP_ENDPOINT}translate`, formData)
    .then(response => {
      this.setState({ selectedFile: false })
      this.setState({ fileUploadedSuccessfully: true });
      this.setState({ APIResult: response.data.result });
    }).catch((error) => {
      console.log(error)
    })
  }

  onOriginLangChange = (event) => {
    this.setState({ origLang: event.target.value });
  }

  showTargetLangs = () => {
    if (this.state.origLang) {
      return (
        <select onChange={this.onTargetLangChange}>
          <option value="What language do you want to translate your subtitles into?"> Select target language </option>
          {langs[this.state.origLang].map((lang) => <option key={lang} value={lang}>{lang_mapping[lang]}</option>)}
        </select>
      )
    } else {
       return (
        <div>
          <br />
        </div>
      )
    }
  }

  onTargetLangChange = (event) => {
    this.setState({ targetLang: event.target.value });
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
          <h4>File translated successfully</h4>
          <button onClick={() => { window.open(this.state.APIResult, "_blank"); }}>
            Download your translated file
          </button>
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
            </div>
            <div>
              <select onChange={this.onOriginLangChange}>
                <option value="What language are your subtitles in?"> Select origin language </option>
                {Object.keys(langs).map((lang) => <option key={lang} value={lang}>{lang_mapping[lang]}</option>)}
              </select>
              {this.showTargetLangs()}
            </div>
            <div>
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