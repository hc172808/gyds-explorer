package utils

import (
	"bytes"
	"encoding/gob"
	"encoding/json"
)

// ToJSON serializes any value to JSON bytes
func ToJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

// FromJSON deserializes JSON bytes into a target value
func FromJSON(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

// ToJSONPretty serializes with indentation
func ToJSONPretty(v interface{}) ([]byte, error) {
	return json.MarshalIndent(v, "", "  ")
}

// ToGob serializes using Go's gob encoding (for internal storage)
func ToGob(v interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// FromGob deserializes from gob encoding
func FromGob(data []byte, v interface{}) error {
	buf := bytes.NewBuffer(data)
	dec := gob.NewDecoder(buf)
	return dec.Decode(v)
}
