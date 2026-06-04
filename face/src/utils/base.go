package utils

import (
	"encoding/base64"
	"fmt"
	"os"
)

func FileToBase64(filePath string) string {
	imageData, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Printf("Error file transform base64: %v", err)
		return ""
	}
	base64Encoded := base64.StdEncoding.EncodeToString(imageData)

	return base64Encoded

}
