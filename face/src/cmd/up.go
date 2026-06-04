/*
Copyright © 2024 NAME HERE <EMAIL ADDRESS>
*/
package cmd

import (
	"checkin/server"

	"github.com/spf13/cobra"
)

// rootCmd represents the base command when called without any subcommands
var upCmd = &cobra.Command{
	Use:   "up",
	Short: "Run server",
	Run: func(cmd *cobra.Command, args []string) {
		server.Run()
	},
}

func init() {
	//
	rootCmd.AddCommand(upCmd)
	// rootCmd.Flags().BoolP("toggle", "t", false, "Help message for toggle")
}
